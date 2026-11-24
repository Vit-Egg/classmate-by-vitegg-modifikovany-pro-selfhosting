/**
 * Tabulka REST cest API v1. Každá cesta volá jeden nástroj ze společného registru (lib/mcp), takže API umí přesně to, co uživatel
 * v aplikaci, se stejnými právy a limity jako MCP. Parametry z cesty (`:název`) se předají nástroji jako argument stejného jména;
 * zbytek argumentů je z query (GET) nebo z JSON těla. Cokoli, co tu nemá hezkou cestu, jde zavolat přes POST /tools/{nástroj}.
 */
export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type Route = { method: Method; path: string; tool: string; summary?: string; /** pevné argumenty navíc */ fixed?: Record<string, unknown>; tag: string };

const r = (tag: string, method: Method, path: string, tool: string, fixed?: Record<string, unknown>): Route => ({ tag, method, path, tool, fixed });

export const ROUTES: Route[] = [
  r("Dnes", "GET", "/today", "get_today"),
  r("Rozvrh", "GET", "/timetable", "get_timetable"),
  r("Předměty", "GET", "/subjects", "list_subjects"),
  r("Předměty", "GET", "/subjects/:subject_id", "get_subject"),

  r("Úkoly", "GET", "/tasks", "list_tasks"),
  r("Úkoly", "POST", "/tasks", "create_task"),
  r("Úkoly", "PATCH", "/tasks/:task_id", "update_task"),
  r("Úkoly", "PUT", "/tasks/:task_id/done", "set_task_done"),
  r("Úkoly", "DELETE", "/tasks/:task_id", "delete_task"),

  r("Testy a zkoušení", "GET", "/tests", "list_tests"),
  r("Testy a zkoušení", "POST", "/tests", "create_test"),
  r("Testy a zkoušení", "PATCH", "/tests/:test_id", "update_test"),
  r("Testy a zkoušení", "DELETE", "/tests/:test_id", "delete_test"),

  r("Známky a absence", "GET", "/marks", "get_marks"),
  r("Známky a absence", "GET", "/absences", "get_absences"),
  r("Známky a absence", "PUT", "/settings/marks-sharing", "set_marks_sharing"),

  r("Poznámky", "GET", "/notes", "list_notes"),
  r("Poznámky", "POST", "/notes", "create_note"),
  r("Poznámky", "GET", "/notes/shared", "list_shared_notes"),
  r("Poznámky", "GET", "/notes/collaborative", "list_collaborative_notes"),
  r("Poznámky", "GET", "/notes/trash", "list_trashed_notes"),
  r("Poznámky", "GET", "/notes/:note_id", "get_note"),
  r("Poznámky", "PATCH", "/notes/:note_id", "update_note"),
  r("Poznámky", "DELETE", "/notes/:note_id", "delete_note"),
  r("Poznámky", "POST", "/notes/:note_id/duplicate", "duplicate_note"),
  r("Poznámky", "PUT", "/notes/:note_id/pinned", "set_note_pinned"),
  r("Poznámky", "PUT", "/notes/:note_id/shared", "set_note_shared"),
  r("Poznámky", "POST", "/notes/:note_id/restore", "restore_note"),
  r("Poznámky", "DELETE", "/notes/:note_id/purge", "purge_note"),
  r("Poznámky", "GET", "/notes/:note_id/versions", "list_note_versions"),
  r("Poznámky", "POST", "/notes/:note_id/versions/:version_id/restore", "restore_note_version"),
  r("Poznámky", "GET", "/notes/:note_id/collaborators", "list_note_collaborators"),
  r("Poznámky", "POST", "/notes/:note_id/collaborators", "invite_note_collaborator"),
  r("Poznámky", "DELETE", "/notes/:note_id/collaborators/:name", "remove_note_collaborator"),

  r("Kalendář", "GET", "/calendar", "get_calendar"),
  r("Kalendář", "POST", "/calendar/events", "create_calendar_event"),
  r("Kalendář", "PUT", "/calendar/events/:event_id", "update_calendar_event"),
  r("Kalendář", "DELETE", "/calendar/events/:event_id", "delete_calendar_event"),
  r("Kalendář", "GET", "/calendar/feed", "get_calendar_feed"),
  r("Kalendář", "POST", "/calendar/feed", "regenerate_calendar_feed"),
  r("Kalendář", "DELETE", "/calendar/feed", "delete_calendar_feed"),
  r("Kalendář", "PUT", "/calendar/feed/kinds", "set_calendar_feed_kinds"),

  r("Zprávy", "GET", "/messages", "list_messages"),
  r("Zprávy", "POST", "/messages/read", "mark_messages_read"),
  r("Zprávy", "DELETE", "/messages", "delete_messages"),
  r("Zprávy", "DELETE", "/messages/:message_id", "delete_messages"),
  r("Zprávy", "PUT", "/messages/categories/:category", "set_message_category"),

  r("Komens", "GET", "/komens", "list_komens"),
  r("Komens", "GET", "/komens/types", "get_komens_types"),
  r("Komens", "POST", "/komens", "send_komens"),
  r("Komens", "GET", "/komens/:message_id", "get_komens_message"),

  r("Spolužáci", "GET", "/classmates", "list_classmates"),
  r("Služby", "GET", "/duty", "get_duty"),
  r("Obědy", "GET", "/lunch", "get_lunch_menu"),
  r("Obědy", "POST", "/lunch/order", "order_lunch"),

  r("Pokladna", "GET", "/cash", "get_cash"),
  r("Pokladna", "POST", "/cash/requests", "create_cash_request"),
  r("Pokladna", "DELETE", "/cash/requests/:request_id", "delete_cash_request"),
  r("Pokladna", "PUT", "/cash/requests/:request_id/closed", "close_cash_request"),
  r("Pokladna", "POST", "/cash/requests/:request_id/people", "add_cash_request_people"),
  r("Pokladna", "DELETE", "/cash/payments/:payment_id", "remove_cash_person"),
  r("Pokladna", "PUT", "/cash/payments/:payment_id/amount", "set_cash_payment_amount"),
  r("Pokladna", "PUT", "/cash/payments/:payment_id/paid", "mark_cash_payment"),
  r("Pokladna", "PUT", "/cash/payments/:payment_id/exempt", "exempt_cash_payment"),
  r("Pokladna", "POST", "/cash/payments/:payment_id/claim", "claim_cash_payment"),
  r("Pokladna", "DELETE", "/cash/payments/:payment_id/claim", "withdraw_cash_claim"),
  r("Pokladna", "POST", "/cash/payments/:payment_id/reject", "reject_cash_claim"),

  r("Nástěnka třídy", "GET", "/board", "list_board_posts"),
  r("Nástěnka třídy", "POST", "/board/seen", "mark_board_seen"),
  r("Nástěnka třídy", "POST", "/board/posts", "save_board_post"),
  r("Nástěnka třídy", "PUT", "/board/posts/:post_id", "save_board_post"),
  r("Nástěnka třídy", "DELETE", "/board/posts/:post_id", "delete_board_post"),
  r("Nástěnka třídy", "PUT", "/board/posts/:post_id/pinned", "pin_board_post"),
  r("Nástěnka třídy", "POST", "/board/posts/:post_id/votes", "vote_board_poll"),
  r("Nástěnka třídy", "POST", "/board/posts/:post_id/reactions", "react_board_post"),
  r("Nástěnka třídy", "POST", "/board/posts/:post_id/comments", "comment_board_post"),
  r("Nástěnka třídy", "DELETE", "/board/comments/:comment_id", "delete_board_comment"),

  r("Trofeje", "GET", "/trophies", "get_trophies"),
  r("Trofeje", "GET", "/leaderboard", "get_leaderboard"),
  r("Trofeje", "PUT", "/leaderboard/visibility", "set_leaderboard_visible"),

  r("Účet a nastavení", "GET", "/profile", "get_profile"),
  r("Účet a nastavení", "GET", "/export", "export_my_data"),
  r("Účet a nastavení", "DELETE", "/profile/avatar", "remove_my_avatar"),
  r("Účet a nastavení", "PUT", "/settings/email-notifications", "set_email_notifications"),
  r("Účet a nastavení", "PUT", "/settings/share-all-notes", "set_share_all_notes"),
  r("Účet a nastavení", "PUT", "/settings/note-title-template", "set_note_title_template"),
  r("Účet a nastavení", "PUT", "/settings/preferences/:key", "set_preference"),
  r("Synchronizace", "POST", "/sync", "sync_now"),
  r("Synchronizace", "POST", "/todoist/sync", "sync_todoist"),
  r("Synchronizace", "DELETE", "/todoist", "disconnect_todoist"),
];

/** Cesta ze šablony → regulární výraz s pojmenovanými parametry. */
const compiled = ROUTES.map((route) => {
  const names: string[] = [];
  const rx = new RegExp("^" + route.path.replace(/:(\w+)/g, (_, n) => (names.push(n), "([^/]+)")) + "/?$");
  return { route, rx, names };
});

export function matchRoute(method: string, path: string): { route: Route; params: Record<string, string> } | { allowed: Method[] } | null {
  const allowed = new Set<Method>();
  for (const { route, rx, names } of compiled) {
    const m = rx.exec(path);
    if (!m) continue;
    if (route.method !== method) {
      allowed.add(route.method);
      continue;
    }
    return { route, params: Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
  }
  return allowed.size ? { allowed: [...allowed] } : null;
}
