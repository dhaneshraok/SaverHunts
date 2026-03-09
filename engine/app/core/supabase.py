from supabase import create_client, Client
from .config import settings

def get_supabase_client() -> Client:
    # Initialize Supabase client using environment configurations
    return create_client(settings.supabase_url, settings.supabase_key)

supabase = get_supabase_client()
