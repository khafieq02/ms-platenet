# MS-PlateNet Database Setup (PostgreSQL)

This folder contains the database schema and sample seed records for the **MS-PlateNet** system.

## Setup Instructions

### 1. Install PostgreSQL
Make sure PostgreSQL (v14 or newer) is installed and running on your system.

### 2. Create the Database
Open pgAdmin or your terminal (psql) and create the database:
`sql
CREATE DATABASE msplatenet;
`

### 3. Import Schema & Seed Data (Optional)
The FastAPI backend will **automatically create all tables** on startup when configured. However, you can also manually initialize the schema and insert sample records:

Using psql:
`ash
psql -U postgres -d msplatenet -f database/schema.sql
psql -U postgres -d msplatenet -f database/seed_data.sql
`

Or open schema.sql in **pgAdmin Query Tool** and click **Execute (F5)**.

### 4. Configure Backend Connection
In ackend/.env, set your connection URL:
`env
DATABASE_URL=postgresql+asyncpg://postgres:YOUR_PASSWORD@localhost:5432/msplatenet
`
