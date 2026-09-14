"""
MS-PlateNet - Multi-Frame Temporal Voting for OCR Stabilisation

Instead of emitting each raw OCR read directly, this module collects
the last N reads in a sliding window and applies majority voting to
determine a stable, consensus plate text.  Only when enough reads
agree (fuzzy character-level similarity) does the voter emit the
result, eliminating single-frame glitches caused by glare, motion
blur, or partial occlusion.

Algorithm
---------
1.  Each OCR result (plate_text, country) is appended to a
    fixed-size deque (`window_size`, default 5).
2.  Non-empty reads are grouped by *character similarity*
    (difflib.SequenceMatcher >= `similarity_threshold`, default 0.80).
3.  The largest group is identified.
4.  If that group has >= `min_agreement` members (default 3), the
    *most common exact string* in the group becomes the consensus.
5.  The consensus country is derived from `classify_plate()` on the
    consensus text (deterministic).
6.  A `voting_confidence` score (0.0 – 1.0) = agreeing / window_size
    is returned alongside the result so the frontend can display it.

Thread Safety
-------------
All public methods acquire `self._lock` (threading.Lock) so the voter
can be called from both the OCR callback thread and the main asyncio
loop without data races.
"""

from collections import Counter, deque
from difflib import SequenceMatcher
import threading
from typing import NamedTuple


class VoteResult(NamedTuple):
    """Immutable snapshot of the current voter consensus."""
    plate_text: str
    country: str
    voting_confidence: float   # 0.0 – 1.0
    raw_reads: int             # how many reads are in the window
    agreeing_reads: int        # how many reads agree with consensus


class PlateVoter:
    """
    Sliding-window majority voter for OCR plate text stabilisation.

    Parameters
    ----------
    window_size : int
        Number of recent OCR reads to keep (default 5).
    min_agreement : int
        Minimum reads that must agree before a consensus is emitted
        (default 3).  Must be <= window_size.
    similarity_threshold : float
        Minimum SequenceMatcher ratio to consider two plate strings
        as referring to the same physical plate (default 0.80).
    classify_fn : callable
        A function ``(str) -> str`` that maps plate text to a country
        label.  Injected to avoid a circular import.
    """

    def __init__(
        self,
        window_size: int = 5,
        min_agreement: int = 3,
        similarity_threshold: float = 0.80,
        classify_fn=None,
    ):
        if min_agreement > window_size:
            raise ValueError("min_agreement cannot exceed window_size")

        self.window_size = window_size
        self.min_agreement = min_agreement
        self.similarity_threshold = similarity_threshold
        self._classify = classify_fn or (lambda t: "Unknown")

        self._history: deque[str] = deque(maxlen=window_size)
        self._lock = threading.Lock()

        # Cached consensus (survives between add_read calls)
        self._consensus_text: str = ""
        self._consensus_country: str = "Unknown"
        self._consensus_confidence: float = 0.0
        self._agreeing: int = 0

    # ── Public API ──────────────────────────────────────────────

    def add_read(self, plate_text: str) -> VoteResult:
        """
        Submit a new OCR read and return the updated consensus.

        Parameters
        ----------
        plate_text : str
            The cleaned OCR text for this frame (may be empty if OCR
            failed or returned junk).

        Returns
        -------
        VoteResult
            The current consensus after incorporating this read.
        """
        with self._lock:
            self._history.append(plate_text)
            self._update_consensus()
            return self._snapshot()

    def get_consensus(self) -> VoteResult:
        """Return the current consensus without adding a new read."""
        with self._lock:
            return self._snapshot()

    def clear(self) -> None:
        """Reset all state (e.g. when the vehicle leaves)."""
        with self._lock:
            self._history.clear()
            self._consensus_text = ""
            self._consensus_country = "Unknown"
            self._consensus_confidence = 0.0
            self._agreeing = 0

    # ── Internal ────────────────────────────────────────────────

    def _similarity(self, a: str, b: str) -> float:
        """Character-level similarity ratio between two strings."""
        if not a or not b:
            return 0.0
        return SequenceMatcher(None, a, b).ratio()

    def _update_consensus(self) -> None:
        """Recompute consensus from the current history window."""
        # Collect non-empty reads only
        reads = [r for r in self._history if r]

        if not reads:
            self._consensus_text = ""
            self._consensus_country = "Unknown"
            self._consensus_confidence = 0.0
            self._agreeing = 0
            return

        # ── Group by similarity ──
        # Greedy single-pass clustering: assign each read to the first
        # existing group whose representative it is similar enough to,
        # or start a new group.
        groups: list[list[str]] = []
        representatives: list[str] = []

        for text in reads:
            placed = False
            for idx, rep in enumerate(representatives):
                if self._similarity(text, rep) >= self.similarity_threshold:
                    groups[idx].append(text)
                    placed = True
                    break
            if not placed:
                groups.append([text])
                representatives.append(text)

        # Find the largest group
        best_group = max(groups, key=len)
        count = len(best_group)

        if count >= self.min_agreement:
            # Pick the most frequently occurring exact string
            most_common_text = Counter(best_group).most_common(1)[0][0]
            self._consensus_text = most_common_text
            self._consensus_country = self._classify(most_common_text)
            self._consensus_confidence = round(count / self.window_size, 2)
            self._agreeing = count
        else:
            # Not enough agreement yet — hold previous consensus if any,
            # but reduce confidence to signal instability.
            # If we had a previous consensus and the new best group is
            # similar to it, keep it with reduced confidence.
            if self._consensus_text and best_group:
                best_candidate = Counter(best_group).most_common(1)[0][0]
                if self._similarity(best_candidate, self._consensus_text) >= self.similarity_threshold:
                    # Close enough — keep previous consensus but lower confidence
                    self._consensus_confidence = round(count / self.window_size, 2)
                    self._agreeing = count
                    return

            # Otherwise, not enough data — report nothing yet
            self._consensus_text = ""
            self._consensus_country = "Unknown"
            self._consensus_confidence = 0.0
            self._agreeing = 0

    def _snapshot(self) -> VoteResult:
        return VoteResult(
            plate_text=self._consensus_text,
            country=self._consensus_country,
            voting_confidence=self._consensus_confidence,
            raw_reads=len(self._history),
            agreeing_reads=self._agreeing,
        )
