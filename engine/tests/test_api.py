import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
from main import app

client = TestClient(app)

def test_search_endpoint_queues_task():
    # Mock the Celery task delay method
    with patch("main.dummy_scrape.delay") as mock_delay:
        # Create a dummy task object to return
        class MockTask:
            id = "test-task-123"
        
        mock_delay.return_value = MockTask()
        
        response = client.post(
            "/api/v1/search",
            json={"query": "test query"}
        )
        
        assert response.status_code == 202
        assert response.json() == {
            "message": "Search queued",
            "task_id": "test-task-123"
        }
        mock_delay.assert_called_once_with("test query")
