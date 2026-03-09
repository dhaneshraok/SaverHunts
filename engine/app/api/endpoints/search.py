from fastapi import APIRouter
from pydantic import BaseModel
import hashlib

router = APIRouter()

class SearchRequest(BaseModel):
    query: str

class SearchResponse(BaseModel):
    task_id: str
    status: str

@router.post("/", response_model=SearchResponse, status_code=202)
async def create_search_task(request: SearchRequest):
    # Hash the query to create a unique task ID
    task_id = hashlib.md5(request.query.encode()).hexdigest()
    
    # TODO: Check Redis cache for instant hit
    
    # TODO: Dispatch Celery task with the query and task_id
    
    return SearchResponse(task_id=task_id, status="processing")
