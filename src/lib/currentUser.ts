// Who the app is acting as. v1 has no logins: everything belongs to one hardcoded user,
// the same id the database defaults `user_id` to. Anything that must not mix between
// people sharing a browser (the editor draft) keys off this — so when real auth arrives,
// this becomes the signed-in user's id and those things separate automatically. (Signing
// out should also clear them; see clearDraft in editorDraft.ts.)
export const CURRENT_USER_ID = '00000000-0000-0000-0000-000000000001'

export function getCurrentUserId(): string {
  return CURRENT_USER_ID
}
