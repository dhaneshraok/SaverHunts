import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
# Supabase gives a connection string typically, but if we have the password, we can connect.
# Wait, do we have a postgres connection string? 
# Usually we just use supabase client or if we need to create a table, we need postgres credentials.
# In the previous step, we had `create_table.py` which had the postgres connection string hardcoded or in env.
# Let's check `create_table.py` first...
