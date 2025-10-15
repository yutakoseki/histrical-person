export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-4">Figures Admin</h1>
        <p className="text-slate-300">アプリケーションが正常に動作しています</p>
      </div>
    </div>
  );
}
