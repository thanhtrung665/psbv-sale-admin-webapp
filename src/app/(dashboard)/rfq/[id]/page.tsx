export default function RFQWorkspacePage({ params }: { params: { id: string } }) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">RFQ Workspace - {params.id}</h1>
      <div className="bg-white rounded shadow p-4">
        <p>Workspace for processing RFQ items, calculating CBU, and viewing documents.</p>
      </div>
    </div>
  );
}
