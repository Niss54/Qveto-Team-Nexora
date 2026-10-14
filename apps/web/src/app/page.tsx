export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="card max-w-2xl w-full text-center">
        <div className="mb-6">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            🚀 Qveto Platform
          </h1>
          <p className="text-lg text-gray-600">
            Project Management &amp; Team Collaboration
          </p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-center gap-2">
            <span className="text-green-500 text-xl">✅</span>
            <span className="text-green-700 font-medium">
              Platform is running successfully
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-500">Frontend</p>
            <p className="font-semibold text-gray-900">Next.js</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-500">Backend</p>
            <p className="font-semibold text-gray-900">Express API</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-500">Database</p>
            <p className="font-semibold text-gray-900">PostgreSQL</p>
          </div>
        </div>

        <p className="text-sm text-gray-400">
          Team Nexora &middot; Qveto Technologies
        </p>
      </div>
    </main>
  );
}
