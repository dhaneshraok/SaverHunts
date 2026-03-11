import os
from celery import Celery

# Assume Redis is running locally on the default port for the broker & backend
redis_url = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "saverhunt_tasks",
    broker=redis_url,
    backend=redis_url,
    include=["tasks.scrapers", "tasks.grocery_scrapers"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Kolkata",
    enable_utc=True,
    # Production hardening
    task_acks_late=True,              # Retry if worker crashes mid-task
    worker_prefetch_multiplier=1,     # Fair distribution across workers
    task_soft_time_limit=30,          # 30s soft limit per task
    task_time_limit=60,               # 60s hard kill
    task_default_retry_delay=5,       # 5s between retries
    task_max_retries=3,               # Max 3 retries per task
    result_expires=3600,              # Results expire after 1 hour
)

# Celery Beat Schedule
celery_app.conf.beat_schedule = {
    'check-price-alerts-hourly': {
        'task': 'tasks.scheduler.check_price_alerts',
        'schedule': 3600.0,  # Run every 3600 seconds (1 hour)
    },
}
