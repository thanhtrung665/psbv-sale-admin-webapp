export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="p-8 bg-white rounded-lg shadow-md max-w-md w-full">
        <h1 className="text-2xl font-bold mb-6 text-center">Login</h1>
        {/* Login form will go here */}
        <p className="text-sm text-gray-500 text-center">Authentication handled by NextAuth</p>
      </div>
    </div>
  );
}
