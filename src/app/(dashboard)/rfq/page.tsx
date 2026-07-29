export default function RFQListPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">RFQ Management</h1>
      <div className="bg-white rounded shadow p-4">
        <p>List of RFQs, divided by 7 status tabs.</p>
        {/* Tabs: INQUIRY_RECEIVED, RFO_PENDING_ADMIN, etc. */}
      </div>
    </div>
  );
}
