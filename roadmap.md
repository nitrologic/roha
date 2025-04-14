# roha features under consideration
---

**Model-Agnostic Accounts**

Decouple models from account specifics.

New roha.accounts list could keep {accountId,enabled} state list

Add accountId to model object, keep enabled accounts open.

---

**Shared Files Dupes**

Convert `sharedFiles` array to object structure.

Migration logic and path-based key checks to avoid redundancy.

Under Discussion

---

**Model Services**

Utilise a model interaction to name shares, manage history

Under Discussion

---

**Inlist Mode**

Enable index-based response after a command generated list

Core logic for indexing and re-running commands, with UI integration for numbered results.

Under Discussion

---

**Error Handling**

Improve robustness for file operations and API calls.

Add granular logging and user feedback for failures, focusing on silent edge cases.

Under Discussion

---

**History Management**

Ensure reliability when splicing history entries.

Add format validation and malformed entry handling to prevent data loss.

Under Discussion

---

**API Timeout/Retry**

Prevent hangs in `relay()` during network issues.

Timeout logic with exponential backoff for retries. (35 loc)

---

**ANSI Rendering**

Support dynamic terminal resizing.

Handle nested markdown (e.g., bold in headers) and adjust wrapping. (50 loc)

---

**Autosave**

Persist session state on exit.

Hooks for saving
history and config automatically. (40 loc)

---

**Auto-Completion**

Tab-based command and path suggestions.

Handler for partial input matching
and display. (80 loc)
