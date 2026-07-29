export default function SettingsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">System Settings</h1>
      <div className="bg-white rounded shadow p-4">
        <p>Configure Exchange Rates and AI processing settings.</p>
        <p className="text-red-500 text-sm mt-2">ADMIN ONLY access.</p>
      </div>
    </div>
  );
}
