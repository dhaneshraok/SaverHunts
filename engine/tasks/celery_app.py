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
)

# Celery Beat Schedule
celery_app.conf.beat_schedule = {
    'check-price-alerts-hourly': {
        'task': 'tasks.scheduler.check_price_alerts',
        'schedule': 3600.0,  # Run every 3600 seconds (1 hour)
    },
}
