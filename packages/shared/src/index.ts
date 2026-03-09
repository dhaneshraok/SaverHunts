export interface SearchTaskRequest {
    query: string;
}

export interface SearchTaskResponse {
    task_id: string;
    status: 'processing' | 'success' | 'failed';
}

export interface ProductResult {
    title: string;
    price: number;
    currency: string;
    platform: 'amazon' | 'flipkart' | 'myntra' | 'jiomart';
    url: string;
    image_url: string;
    rating?: number;
}
