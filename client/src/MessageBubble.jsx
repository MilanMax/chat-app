import { format } from "date-fns";

export default function MessageBubble({
  mine,
  username,
  text,
  ts,
  isScheduled,
  deliverAt,
  scheduledDelivered
}) {
  const time = ts ? format(new Date(ts), "hh:mm a") : "";

  const isPending = isScheduled && !scheduledDelivered;
  const isDeliveredScheduled = isScheduled && scheduledDelivered;

  // 💡 Klasa za zatamnjenje kad je poruka delivered
  const bubbleClass = mine
    ? `max-w-[75%] self-end rounded-2xl px-3 py-2 text-sm ${
        isDeliveredScheduled
          ? "bg-bubbleSelf text-white opacity-50 border border-indigo-300/10"
          : "bg-bubbleSelf text-white border border-indigo-400/30"
      }`
    : "max-w-[75%] self-start rounded-2xl px-3 py-2 text-sm bg-bubbleOther text-white border border-slate-700";

  // 💬 Italic info
  let statusText = "";
  if (isPending) {
    const timeStr = deliverAt ? format(new Date(deliverAt), "hh:mm a") : "";
    statusText = `Scheduled for ${timeStr}`;
  } else if (isDeliveredScheduled) {
    statusText = "Delivered (scheduled)";
  }

  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"} space-y-1`}>
      {/* ✅ Prikaži username iznad poruke (samo kod drugih korisnika) */}
      {!mine && (
        <div className="text-[0.75rem] text-indigo-300 font-semibold mb-[2px]">
          {username}
        </div>
      )}

      <div className={bubbleClass}>
        <span className="break-words">{text}</span>
        {isScheduled && (
          <span className="ml-1 inline-block align-middle">⏰</span>
        )}
      </div>

      {/* italic info */}
      {statusText && (
        <div className="text-[0.7rem] italic text-gray-400 mt-[1px]">
          {statusText}
        </div>
      )}

      {/* vreme */}
      <div className="text-[0.65rem] text-gray-500">{time}</div>
    </div>
  );
}
