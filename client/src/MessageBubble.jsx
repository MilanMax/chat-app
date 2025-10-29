export default function MessageBubble({
  mine,
  username,
  text,
  ts,
  isScheduled,
  deliverAt
}) {
  const bubbleClass = mine
    ? "bg-indigo-600 text-white self-end"
    : "bg-slate-700 text-gray-100 self-start";

  const time = ts
    ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      {!mine && (
        <span className="text-[0.7rem] text-slate-400 mb-1">{username}</span>
      )}
      <div
        className={`px-3 py-2 rounded-2xl text-sm max-w-[80%] border border-slate-800 ${bubbleClass}`}
      >
        <span>{text}</span>
        {isScheduled && (
          <span
            className="ml-1 text-[0.8rem] opacity-80"
            title={`Scheduled for ${new Date(
              deliverAt || Date.now()
            ).toLocaleTimeString()}`}
          >
            ⏰
          </span>
        )}
      </div>
      <span className="text-[0.65rem] text-slate-500 mt-1">{time}</span>
    </div>
  );
}
