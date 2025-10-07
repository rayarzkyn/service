import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { auth, db } from "../../firebase/config";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";

export default function PelangganDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [stokBarang, setStokBarang] = useState([]);
  const [services, setServices] = useState([]);
  const [activeTab, setActiveTab] = useState("produk");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: 'nama', direction: 'asc' });

  // Cek auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push("/");
      } else {
        setUser(currentUser);
        fetchData(currentUser.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  // Ambil data
  const fetchData = async (userId) => {
    try {
      setLoading(true);
      
      // Data stok barang
      const stokSnapshot = await getDocs(collection(db, "stok"));
      const stokData = stokSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStokBarang(stokData);

      // Data service milik pelanggan ini
      const servicesQuery = query(
        collection(db, "service"),
        where("userId", "==", userId)
      );
      const servicesSnapshot = await getDocs(servicesQuery);
      const servicesData = servicesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        formattedDate: doc.data().tanggalMasuk?.toDate?.().toLocaleDateString("id-ID") || '-'
      }));

      // Sort manual by date
      servicesData.sort((a, b) => {
        const dateA = a.tanggalMasuk?.toDate?.() || new Date(0);
        const dateB = b.tanggalMasuk?.toDate?.() || new Date(0);
        return dateB - dateA;
      });

      setServices(servicesData);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      setLoading(false);
    }
  };

  // Filter dan sort barang
  const filteredAndSortedBarang = stokBarang
    .filter(item => 
      item.nama_barang?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.kode_barang?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      if (sortConfig.key === 'nama') {
        return sortConfig.direction === 'asc' 
          ? (a.nama_barang || '').localeCompare(b.nama_barang || '')
          : (b.nama_barang || '').localeCompare(a.nama_barang || '');
      } else if (sortConfig.key === 'harga') {
        return sortConfig.direction === 'asc' 
          ? (a.harga_jual || 0) - (b.harga_jual || 0)
          : (b.harga_jual || 0) - (a.harga_jual || 0);
      }
      return 0;
    });

  const handleSort = (key) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc'
    });
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/");
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Sudah Selesai': return 'bg-green-100 text-green-800 border-green-200';
      case 'Dalam Proses': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Batal': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return '↕️';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg font-medium">Memuat data...</p>
          <p className="text-gray-500 text-sm">Silakan tunggu sebentar</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-2 rounded-lg">
                <span className="text-white font-bold text-lg">📱</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Goku Komunika
                </h1>
                <p className="text-gray-600 text-sm">Dashboard Pelanggan</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm text-gray-600">Selamat datang</p>
                <p className="font-medium text-gray-900">{user?.email}</p>
              </div>
              <button 
                onClick={handleLogout}
                className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-6 py-2 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg font-medium"
              >
                Keluar
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Navigasi */}
        <div className="bg-white rounded-2xl shadow-lg mb-8 overflow-hidden border border-gray-100">
          <div className="flex">
            <button
              className={`flex-1 py-5 font-semibold text-center transition-all duration-200 flex items-center justify-center space-x-2 ${
                activeTab === "produk"
                  ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-inner"
                  : "text-gray-600 hover:bg-gray-50 hover:text-blue-600"
              }`}
              onClick={() => setActiveTab("produk")}
            >
              <span>📦</span>
              <span>Katalog Produk</span>
            </button>
            
          </div>
        </div>

        {/* Konten Berdasarkan Tab */}
        {activeTab === "produk" && (
          <div className="space-y-6">
            {/* Header Section */}
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div>
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
                    Katalog Sparepart & Aksesoris
                  </h2>
                  <p className="text-gray-600 text-lg">
                    Temukan berbagai sparepart dan aksesoris HP dengan harga terbaik
                  </p>
                </div>
                
                {/* Pencarian */}
                <div className="w-full lg:w-96">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-400">🔍</span>
                    </div>
                    <input
                      type="text"
                      placeholder="Cari produk atau kode barang..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50/50"
                    />
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{stokBarang.length}</div>
                  <div className="text-blue-800 font-medium">Total Produk</div>
                </div>
                <div className="bg-gradient-to-r from-green-50 to-green-100 border border-green-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {filteredAndSortedBarang.length}
                  </div>
                  <div className="text-green-800 font-medium">Produk Ditemukan</div>
                </div>
                <div className="bg-gradient-to-r from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    Rp {Math.min(...filteredAndSortedBarang.map(item => item.harga_jual || 0)).toLocaleString()}
                  </div>
                  <div className="text-purple-800 font-medium">Harga Terendah</div>
                </div>
              </div>
            </div>

            {/* Tabel Produk */}
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
              <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-gray-800">Daftar Harga Produk</h3>
                  <div className="text-sm text-gray-600">
                    Menampilkan {filteredAndSortedBarang.length} produk
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-blue-50 to-purple-50 border-b border-gray-200">
                      <th 
                        className="px-6 py-4 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-blue-100/50 transition-colors duration-150"
                        onClick={() => handleSort('nama')}
                      >
                        <div className="flex items-center space-x-2">
                          <span>Nama Produk</span>
                          <span className="text-xs">{getSortIcon('nama')}</span>
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 text-right text-sm font-semibold text-gray-700 cursor-pointer hover:bg-blue-100/50 transition-colors duration-150"
                        onClick={() => handleSort('harga')}
                      >
                        <div className="flex items-center justify-end space-x-2">
                          <span>Harga</span>
                          <span className="text-xs">{getSortIcon('harga')}</span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredAndSortedBarang.map((item, index) => (
                      <tr 
                        key={item.id} 
                        className="hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-purple-50/50 transition-all duration-150 group"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-3">
                            <div className="bg-gradient-to-r from-blue-100 to-purple-100 p-2 rounded-lg group-hover:from-blue-200 group-hover:to-purple-200 transition-all duration-200">
                              <span className="text-blue-600">📦</span>
                            </div>
                            <div>
                              <div className="font-medium text-gray-900 group-hover:text-blue-700 transition-colors">
                                {item.nama_barang}
                              </div>
                              <div className="text-sm text-gray-500 mt-1">
                                Kode: {item.kode_barang}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-lg font-bold text-green-600 group-hover:text-green-700 transition-colors">
                              Rp {item.harga_jual?.toLocaleString() || '0'}
                            </span>
                            <span className="text-xs text-gray-500 mt-1">
                              Harga retail
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredAndSortedBarang.length === 0 && (
                <div className="text-center py-16">
                  <div className="text-6xl mb-4">🔍</div>
                  <h3 className="text-xl font-semibold text-gray-700 mb-2">
                    {searchTerm ? "Produk tidak ditemukan" : "Belum ada produk"}
                  </h3>
                  <p className="text-gray-500 max-w-md mx-auto">
                    {searchTerm 
                      ? "Coba gunakan kata kunci lain atau periksa pengejaan"
                      : "Produk akan segera tersedia"
                    }
                  </p>
                </div>
              )}
            </div>

            {/* Info Footer */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-2xl p-6">
              <div className="flex items-center space-x-3">
                <div className="bg-blue-100 p-3 rounded-xl">
                  <span className="text-blue-600 text-xl">💡</span>
                </div>
                <div>
                  <h4 className="font-semibold text-blue-800">Informasi Penting</h4>
                  <p className="text-blue-700 text-sm mt-1">
                    Harga dapat berubah sewaktu-waktu. Untuk informasi stok dan pemesanan, 
                    silakan hubungi admin toko langsung.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "service" && (
          <div className="space-y-6">
            {/* Header Service */}
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
              <h2 className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent mb-2">
                Tracking Service HP
              </h2>
              <p className="text-gray-600 text-lg">
                Pantau progress perbaikan HP Anda secara real-time
              </p>

              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{services.length}</div>
                  <div className="text-blue-800 font-medium">Total Service</div>
                </div>
                <div className="bg-gradient-to-r from-green-50 to-green-100 border border-green-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {services.filter(s => s.status === 'Sudah Selesai').length}
                  </div>
                  <div className="text-green-800 font-medium">Selesai</div>
                </div>
                <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 border border-yellow-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-yellow-600">
                    {services.filter(s => s.status === 'Dalam Proses').length}
                  </div>
                  <div className="text-yellow-800 font-medium">Proses</div>
                </div>
                <div className="bg-gradient-to-r from-red-50 to-red-100 border border-red-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {services.filter(s => s.status === 'Batal').length}
                  </div>
                  <div className="text-red-800 font-medium">Batal</div>
                </div>
              </div>
            </div>

            {/* Tabel Service */}
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
              <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800">Riwayat Service</h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-green-50 to-emerald-50 border-b border-gray-200">
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                        Tanggal
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                        Merk HP
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                        Kerusakan
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                        Biaya
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {services.map((service) => (
                      <tr key={service.id} className="hover:bg-gradient-to-r hover:from-green-50/50 hover:to-emerald-50/50 transition-all duration-150">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                          {service.formattedDate}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="flex items-center space-x-2">
                            <span className="text-lg">📱</span>
                            <span>{service.merkHP}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                          <div className="line-clamp-2" title={service.kerusakan}>
                            {service.kerusakan || "Tidak ada informasi"}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                          Rp {service.biaya?.toLocaleString() || "0"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full border ${getStatusColor(service.status)}`}>
                            {service.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {services.length === 0 && (
                <div className="text-center py-16">
                  <div className="text-6xl mb-4">🔧</div>
                  <h3 className="text-xl font-semibold text-gray-700 mb-2">
                    Belum ada riwayat service
                  </h3>
                  <p className="text-gray-500">
                    Service HP Anda akan muncul di sini setelah dilakukan perbaikan
                  </p>
                </div>
              )}
            </div>

            {/* Info Service */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-6">
              <div className="flex items-center space-x-4">
                <div className="bg-green-100 p-3 rounded-xl">
                  <span className="text-green-600 text-xl">📞</span>
                </div>
                <div>
                  <h4 className="font-semibold text-green-800">Butuh Service HP?</h4>
                  <p className="text-green-700 text-sm mt-1">
                    Untuk service HP baru atau informasi lebih lanjut, silakan datang langsung 
                    ke toko kami atau hubungi admin melalui WhatsApp.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-blue-700 text-white text-center py-5 mt-auto shadow-inner">
  <p className="text-sm tracking-wide">
    &copy; {new Date().getFullYear()} Goku Komunika | Dibuat oleh Raya Rizkyana. All rights reserved.
  </p>
</footer>
    </div>
  );
}