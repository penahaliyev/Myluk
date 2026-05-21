# Security Specification

## Data Invariants
- `userId` must always match `request.auth.uid`.
- Users can only read and write their own documents in `users/{userId}`.
- Wardrobe items and outfits must be nested under the correct `users/{userId}` path securely guaranteeing ownership.
- Timestamps (`createdAt`, `updatedAt`) must match `request.time`.
- `WardrobeItem` and `Outfit` must be within reasonable sizes and strict schema definitions.
- `itemIds` arrays must have a size limit (e.g., max 10 items).

## The Dirty Dozen Payloads
1. User profile creation with mismatched `userId`.
2. Update `userId` to impersonate another user.
3. User profile creation with invalid language code.
4. User profile missing `createdAt`.
5. WardrobeItem with huge string (1MB) in `category`.
6. WardrobeItem missing `imageUrl`.
7. WardrobeItem created under another user's path.
8. Outfit with more than 10 `itemIds`.
9. Outfit `itemIds` containing non-string data.
10. Outfit with invalid `status`.
11. Update Outfit modifying `createdAt`.
12. Read another user's outfits.
