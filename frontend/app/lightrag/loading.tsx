export default function LightRAGLoading() {
  return (
    <div
      style={{ height: "calc(100vh - 46px)" }}
      className="flex items-center justify-center bg-[#0a0e17]"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <p className="font-[Orbitron] text-cyan-600 text-xs tracking-widest uppercase">
          Loading LightRAG Explorer...
        </p>
      </div>
    </div>
  );
}
