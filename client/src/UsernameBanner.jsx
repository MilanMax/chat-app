export default function UsernameBanner({ username }) {
  return (
    <div className="text-[0.7rem] text-gray-400 text-center py-2 bg-bg/80 border-b border-slate-700">
      You are <span className="text-indigo-400 font-semibold">{username}</span>.  
      All messages are public in this test room.
    </div>
  );
}
