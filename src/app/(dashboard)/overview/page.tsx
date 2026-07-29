export default function OverviewPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Dashboard Overview</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-4 bg-white rounded shadow">
          <h2 className="text-lg font-semibold">Total Inquiries</h2>
          <p className="text-3xl mt-2">12</p>
        </div>
        {/* More metric cards */}
      </div>
    </div>
  );
}
