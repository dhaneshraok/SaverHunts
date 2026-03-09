from fastapi import APIRouter

router = APIRouter()

@router.get("/{task_id}")
async def get_task_status(task_id: str):
    # Depending on architecture, we might not need polling if we exclusively use WebSockets.
    # But it is good to have a fallback REST endpoint.
    return {"task_id": task_id, "status": "processing"}
