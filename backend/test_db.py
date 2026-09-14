"""Run this to test PostgreSQL connection: python test_db.py"""
import asyncio
from database import engine

async def test():
    async with engine.connect() as conn:
        result = await conn.execute(__import__('sqlalchemy').text("SELECT version()"))
        row = result.fetchone()
        print(f"✓ DB connected OK")
        print(f"✓ PostgreSQL: {row[0][:50]}")

asyncio.run(test())
