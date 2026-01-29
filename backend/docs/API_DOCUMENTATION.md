# API Documentation

## GET /api/items

Fetch all auction listings with optional filters and pagination.

### Endpoint
```
GET /api/items
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number (1-indexed) |
| `limit` | integer | 50 | Items per page (max: 100) |
| `status` | string | null | Filter by status: `active`, `ended`, `scheduled`, `draft`, `cancelled` |
| `category` | string | null | Filter by category |

### Response Format

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Vintage Rolex Watch",
      "description": "Rare 1960s Rolex Submariner in excellent condition",
      "category": "Watches",
      "startingPrice": "5000.00",
      "currentBid": "7500.00",
      "bidIncrement": "100.00",
      "reservePrice": "10000.00",
      "totalBids": 15,
      "highestBidderId": "user-uuid-123",
      "startTime": "2026-01-28T06:00:00.000Z",
      "endTime": "2026-01-29T18:00:00.000Z",
      "originalEndTime": "2026-01-29T18:00:00.000Z",
      "status": "active",
      "seller": {
        "id": "seller-uuid-456",
        "username": "vintage_collector"
      },
      "createdAt": "2026-01-20T10:30:00.000Z",
      "updatedAt": "2026-01-28T11:45:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique auction identifier |
| `title` | string | Auction title |
| `description` | string | Detailed description |
| `category` | string | Auction category |
| `startingPrice` | string | Starting bid amount (decimal as string) |
| `currentBid` | string | Current highest bid (decimal as string) |
| `bidIncrement` | string | Minimum bid increment (decimal as string) |
| `reservePrice` | string\|null | Reserve price (minimum to sell) |
| `totalBids` | integer | Total number of bids placed |
| `highestBidderId` | UUID\|null | Current highest bidder's user ID |
| `startTime` | ISO 8601 | Auction start time (UTC) |
| `endTime` | ISO 8601 | Auction end time (UTC) - **ABSOLUTE TIMESTAMP** |
| `originalEndTime` | ISO 8601 | Original end time before extensions |
| `status` | enum | Auction status |
| `seller.id` | UUID | Seller's user ID |
| `seller.username` | string | Seller's username |
| `createdAt` | ISO 8601 | Record creation timestamp |
| `updatedAt` | ISO 8601 | Last update timestamp |

### Important Notes

1. **Timestamps are Absolute UTC**: All timestamps are in ISO 8601 format (UTC). The client is responsible for computing countdowns and converting to local time.

2. **No Server-Side Countdown**: The server does NOT compute time remaining. Use `endTime` on the client:
   ```javascript
   const timeRemaining = new Date(endTime) - new Date();
   ```

3. **Monetary Values as Strings**: All prices are returned as strings to avoid floating-point precision issues. Parse on client as needed.

4. **Pagination**: Use `pagination.hasNext` and `pagination.hasPrev` to determine if more pages exist.

### Example Requests

#### Get first page of active auctions
```bash
GET /api/items?status=active&page=1&limit=20
```

#### Get auctions in "Electronics" category
```bash
GET /api/items?category=Electronics
```

#### Get page 3 with 10 items per page
```bash
GET /api/items?page=3&limit=10
```

---

## GET /api/items/:id

Fetch a single auction by ID.

### Endpoint
```
GET /api/items/:id
```

### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Auction ID |

### Response Format

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Vintage Rolex Watch",
    "description": "Rare 1960s Rolex Submariner in excellent condition",
    "category": "Watches",
    "startingPrice": "5000.00",
    "currentBid": "7500.00",
    "bidIncrement": "100.00",
    "reservePrice": "10000.00",
    "totalBids": 15,
    "highestBidderId": "user-uuid-123",
    "startTime": "2026-01-28T06:00:00.000Z",
    "endTime": "2026-01-29T18:00:00.000Z",
    "originalEndTime": "2026-01-29T18:00:00.000Z",
    "status": "active",
    "seller": {
      "id": "seller-uuid-456",
      "username": "vintage_collector"
    },
    "createdAt": "2026-01-20T10:30:00.000Z",
    "updatedAt": "2026-01-28T11:45:00.000Z"
  }
}
```

#### Error Response (404 Not Found)

```json
{
  "success": false,
  "error": {
    "code": "AUCTION_NOT_FOUND",
    "message": "Auction not found"
  }
}
```

### Example Request

```bash
GET /api/items/550e8400-e29b-41d4-a716-446655440000
```

---

## Error Responses

### 400 Bad Request
Invalid query parameters or malformed request.

### 404 Not Found
Auction with specified ID does not exist.

### 500 Internal Server Error
Server error (database connection, etc.).

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Internal server error"
  }
}
```
