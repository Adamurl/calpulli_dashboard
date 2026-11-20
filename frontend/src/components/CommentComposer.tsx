import { Avatar } from "./ui";

export function CommentComposer({
  staffName,
  value,
  onChange,
  onPost,
  saving,
}: {
  staffName: string;
  value: string;
  onChange: (value: string) => void;
  onPost: (comment: string) => void;
  saving: boolean;
}) {
  return (
    <form
      className="card note-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim() && !saving) onPost(value.trim());
      }}
    >
      <Avatar name={staffName} />
      <textarea
        aria-label="Internal note"
        disabled={saving}
        placeholder="Leave a comment…"
        value={value}
        maxLength={10000}
        onChange={(event) => onChange(event.target.value)}
      />
      <div>
        <small>Staff only</small>
        <button
          className="button primary compact"
          disabled={saving || !value.trim()}
        >
          {saving ? "Saving…" : "Post"}
        </button>
      </div>
    </form>
  );
}
