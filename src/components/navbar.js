export default function Navbar() {
  return (
    <nav className="bg-white shadow p-4 flex justify-between items-center">
      <h1 className="text-xl font-bold text-blue-600">Goku Komunika</h1>
      <div className="space-x-4">
        <a href="#fitur" className="text-gray-700 hover:text-blue-500">Fitur</a>
        <a href="#tentang" className="text-gray-700 hover:text-blue-500">Tentang</a>
        <a href="/login" className="bg-blue-600 text-white px-4 py-2 rounded">Login</a>
      </div>
    </nav>
  );
}
