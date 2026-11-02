// The user's id when this tick is "own only" (they see only their own records),
// otherwise null (they see the whole branch).
export const ownId = (viewer, permission) => (viewer?.scopes?.[permission] === 'own' ? viewer.id : null);
