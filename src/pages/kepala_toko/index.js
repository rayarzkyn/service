import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../firebase/config";
import { collection, getDocs, query, orderBy, where } from "firebase/firestore";

export default function KepalaTokoDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [stokBarang, setStokBarang] = useState([]);
  const [penjualan, setPenjualan] = useState([]);
  const [pembelian, setPembelian] = useState([]);
  const [activeView, setActiveView] = useState("penjualan"); // penjualan, pembelian, monitoring, stok
  const [loading, setLoading] = useState(true);

  // Cek auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push("/");
      } else {
        setUser(currentUser);
        fetchAllData();
      }
    });
    return () => unsubscribe();
  }, []);

  // Ambil semua data
  const fetchAllData = async () => {
    try {
      setLoading(true);
      
      // Data stok
      const stokQuery = query(collection(db, "stok"), orderBy("nama_barang"));
      const stokSnap = await getDocs(stokQuery);
      const stokData = stokSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setStokBarang(stokData);

      // Data penjualan
      const penjualanQuery = query(collection(db, "penjualan"), orderBy("tanggal", "desc"));
      const penjualanSnap = await getDocs(penjualanQuery);
      const penjualanData = penjualanSnap.docs.map((doc) => ({ 
        id: doc.id, 
        ...doc.data(),
        tanggal: doc.data().tanggal?.toDate?.() || new Date()
      }));
      setPenjualan(penjualanData);

      // Data pembelian
      const pembelianQuery = query(collection(db, "pembelian"), orderBy("tanggal", "desc"));
      const pembelianSnap = await getDocs(pembelianQuery);
      const pembelianData = pembelianSnap.docs.map((doc) => ({ 
        id: doc.id, 
        ...doc.data(),
        tanggal: doc.data().tanggal?.toDate?.() || new Date()
      }));
      setPembelian(pembelianData);

      setLoading(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/");
  };

  // Hitung total penjualan
  const totalPenjualan = penjualan.reduce((sum, p) => sum + (p.totalHarga || 0), 0);
  
  // Hitung total pembelian
  const totalPembelian = pembelian.reduce((sum, p) => sum + (p.totalHarga || 0), 0);

  // Render konten berdasarkan activeView
  const renderContent = () => {
    switch (activeView) {
      case "penjualan":
        return (
          <div className="mb-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-gradient-to-r from-green-500 to-green-600 text-white p-4 rounded-lg shadow">
                <h3 className="font-semibold">Total Transaksi</h3>
                <p className="text-2xl font-bold">{penjualan.length}</p>
              </div>
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 rounded-lg shadow">
                <h3 className="font-semibold">Total Penjualan</h3>
                <p className="text-2xl font-bold">Rp {totalPenjualan.toLocaleString()}</p>
              </div>
              <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-4 rounded-lg shadow">
                <h3 className="font-semibold">Rata-rata/Transaksi</h3>
                <p className="text-2xl font-bold">
                  Rp {penjualan.length > 0 ? (totalPenjualan / penjualan.length).toLocaleString('id-ID', {maximumFractionDigits: 0}) : '0'}
                </p>
              </div>
            </div>

            <h2 className="text-xl font-semibold mb-4">🛒 Laporan Penjualan</h2>
            <div className="overflow-x-auto">
              <table className="w-full border border-gray-300 rounded-lg">
                <thead className="bg-green-100">
                  <tr>
                    <th className="px-4 py-2 border">Tanggal</th>
                    <th className="px-4 py-2 border">No. Transaksi</th>
                    <th className="px-4 py-2 border">Nama Pembeli</th>
                    <th className="px-4 py-2 border">Barang</th>
                    <th className="px-4 py-2 border">Qty</th>
                    <th className="px-4 py-2 border">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {penjualan.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-100">
                      <td className="px-4 py-2 border">
                        {p.tanggal?.toLocaleDateString("id-ID")}
                      </td>
                      <td className="px-4 py-2 border font-mono text-sm">
                        {p.noTransaksi || p.id.slice(-8).toUpperCase()}
                      </td>
                      <td className="px-4 py-2 border">{p.namaPembeli || "Tidak ada nama"}</td>
                      <td className="px-4 py-2 border">
                        {p.items?.map((i) => i.nama_barang).join(", ")}
                      </td>
                      <td className="px-4 py-2 border text-center">
                        {p.items?.reduce((sum, item) => sum + item.qty, 0)}
                      </td>
                      <td className="px-4 py-2 border font-semibold text-green-600">
                        Rp {p.totalHarga?.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case "pembelian":
        return (
          <div className="mb-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-4 rounded-lg shadow">
                <h3 className="font-semibold">Total Pembelian</h3>
                <p className="text-2xl font-bold">{pembelian.length}</p>
              </div>
              <div className="bg-gradient-to-r from-red-500 to-red-600 text-white p-4 rounded-lg shadow">
                <h3 className="font-semibold">Total Biaya</h3>
                <p className="text-2xl font-bold">Rp {totalPembelian.toLocaleString()}</p>
              </div>
              <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white p-4 rounded-lg shadow">
                <h3 className="font-semibold">Rata-rata/Pembelian</h3>
                <p className="text-2xl font-bold">
                  Rp {pembelian.length > 0 ? (totalPembelian / pembelian.length).toLocaleString('id-ID', {maximumFractionDigits: 0}) : '0'}
                </p>
              </div>
            </div>

            <h2 className="text-xl font-semibold mb-4">📥 Laporan Pembelian</h2>
            <div className="overflow-x-auto">
              <table className="w-full border border-gray-300 rounded-lg">
                <thead className="bg-orange-100">
                  <tr>
                    <th className="px-4 py-2 border">Tanggal</th>
                    <th className="px-4 py-2 border">No. Pembelian</th>
                    <th className="px-4 py-2 border">Supplier</th>
                    <th className="px-4 py-2 border">Barang</th>
                    <th className="px-4 py-2 border">Qty</th>
                    <th className="px-4 py-2 border">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pembelian.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-100">
                      <td className="px-4 py-2 border">
                        {p.tanggal?.toLocaleDateString("id-ID")}
                      </td>
                      <td className="px-4 py-2 border font-mono text-sm">
                        {p.noPembelian || p.id.slice(-8).toUpperCase()}
                      </td>
                      <td className="px-4 py-2 border">{p.supplier || "Tidak ada supplier"}</td>
                      <td className="px-4 py-2 border">
                        {p.items?.map((i) => i.nama_barang).join(", ")}
                      </td>
                      <td className="px-4 py-2 border text-center">
                        {p.items?.reduce((sum, item) => sum + item.qty, 0)}
                      </td>
                      <td className="px-4 py-2 border font-semibold text-red-600">
                        Rp {p.totalHarga?.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case "monitoring":
        return (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">📈 Monitoring Stok</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 rounded-lg shadow">
                <h3 className="font-semibold">Total Barang</h3>
                <p className="text-2xl font-bold">{stokBarang.length}</p>
              </div>
              <div className="bg-gradient-to-r from-green-500 to-green-600 text-white p-4 rounded-lg shadow">
                <h3 className="font-semibold">Stok Optimal</h3>
                <p className="text-2xl font-bold">
                  {stokBarang.filter(item => item.qty >= 10 && item.qty <= 100).length}
                </p>
              </div>
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-4 rounded-lg shadow">
                <h3 className="font-semibold">Stok Rendah</h3>
                <p className="text-2xl font-bold">
                  {stokBarang.filter(item => item.qty < 10 && item.qty > 0).length}
                </p>
              </div>
              <div className="bg-gradient-to-r from-red-500 to-red-600 text-white p-4 rounded-lg shadow">
                <h3 className="font-semibold">Stok Habis</h3>
                <p className="text-2xl font-bold">
                  {stokBarang.filter(item => item.qty === 0).length}
                </p>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-semibold mb-3">📋 Ringkasan Status Stok</h3>
              <div className="overflow-x-auto">
                <table className="w-full border border-gray-300">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-2 border">Status Stok</th>
                      <th className="px-4 py-2 border">Jumlah Barang</th>
                      <th className="px-4 py-2 border">Persentase</th>
                      <th className="px-4 py-2 border">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="hover:bg-green-50">
                      <td className="px-4 py-2 border text-green-600 font-semibold">Optimal</td>
                      <td className="px-4 py-2 border">
                        {stokBarang.filter(item => item.qty >= 10 && item.qty <= 100).length}
                      </td>
                      <td className="px-4 py-2 border">
                        {((stokBarang.filter(item => item.qty >= 10 && item.qty <= 100).length / stokBarang.length) * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-2 border text-green-600">Pertahankan</td>
                    </tr>
                    <tr className="hover:bg-orange-50">
                      <td className="px-4 py-2 border text-orange-600 font-semibold">Rendah</td>
                      <td className="px-4 py-2 border">
                        {stokBarang.filter(item => item.qty < 10 && item.qty > 0).length}
                      </td>
                      <td className="px-4 py-2 border">
                        {((stokBarang.filter(item => item.qty < 10 && item.qty > 0).length / stokBarang.length) * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-2 border text-blue-600">Restock</td>
                    </tr>
                    <tr className="hover:bg-red-50">
                      <td className="px-4 py-2 border text-red-600 font-semibold">Habis</td>
                      <td className="px-4 py-2 border">
                        {stokBarang.filter(item => item.qty === 0).length}
                      </td>
                      <td className="px-4 py-2 border">
                        {((stokBarang.filter(item => item.qty === 0).length / stokBarang.length) * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-2 border text-red-600">Segera Restock</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <h3 className="text-lg font-semibold mb-3">📦 Detail Stok Barang</h3>
            <div className="overflow-x-auto">
              <table className="w-full border border-gray-300 rounded-lg">
                <thead className="bg-indigo-100">
                  <tr>
                    <th className="px-4 py-2 border">Kode</th>
                    <th className="px-4 py-2 border">Nama Barang</th>
                    <th className="px-4 py-2 border">Stok</th>
                    <th className="px-4 py-2 border">Harga Jual</th>
                    <th className="px-4 py-2 border">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stokBarang.map((item) => {
                    const isLowStock = item.qty < 10;
                    const isOutOfStock = item.qty === 0;
                    return (
                      <tr key={item.id} className="hover:bg-gray-100">
                        <td className="px-4 py-2 border">{item.kode_barang}</td>
                        <td className="px-4 py-2 border">{item.nama_barang}</td>
                        <td className={`px-4 py-2 border font-semibold ${
                          isOutOfStock ? 'text-red-600' : isLowStock ? 'text-orange-500' : 'text-green-600'
                        }`}>
                          {item.qty}
                        </td>
                        <td className="px-4 py-2 border">
                          Rp {item.harga_jual?.toLocaleString() || '0'}
                        </td>
                        <td className="px-4 py-2 border">
                          {isOutOfStock ? '🟥 Habis' : isLowStock ? '🟨 Rendah' : '🟢 Normal'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );

      case "stok":
        return (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">📦 Laporan Stok Barang</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 rounded-lg shadow">
                <h3 className="font-semibold">Total Barang</h3>
                <p className="text-2xl font-bold">{stokBarang.length}</p>
              </div>
              <div className="bg-gradient-to-r from-green-500 to-green-600 text-white p-4 rounded-lg shadow">
                <h3 className="font-semibold">Nilai Total Stok</h3>
                <p className="text-2xl font-bold">
                  Rp {stokBarang.reduce((sum, item) => sum + (item.harga_jual * item.qty || 0), 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-4 rounded-lg shadow">
                <h3 className="font-semibold">Stok Tersedia</h3>
                <p className="text-2xl font-bold">
                  {stokBarang.filter(item => item.qty > 0).length}
                </p>
              </div>
              <div className="bg-gradient-to-r from-gray-500 to-gray-600 text-white p-4 rounded-lg shadow">
                <h3 className="font-semibold">Stok Kosong</h3>
                <p className="text-2xl font-bold">
                  {stokBarang.filter(item => item.qty === 0).length}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border border-gray-300 rounded-lg">
                <thead className="bg-blue-100">
                  <tr>
                    <th className="px-4 py-2 border">Kode Barang</th>
                    <th className="px-4 py-2 border">Nama Barang</th>
                    <th className="px-4 py-2 border">Stok Awal</th>
                    <th className="px-4 py-2 border">Stok Saat Ini</th>
                    <th className="px-4 py-2 border">Perubahan</th>
                    <th className="px-4 py-2 border">Harga Beli</th>
                    <th className="px-4 py-2 border">Harga Jual</th>
                    <th className="px-4 py-2 border">Nilai Stok</th>
                  </tr>
                </thead>
                <tbody>
                  {stokBarang.map((item) => {
                    const stokAwal = item.stok_awal || item.qty;
                    const perubahan = stokAwal - item.qty;
                    const nilaiStok = item.harga_jual * item.qty || 0;
                    
                    return (
                      <tr key={item.id} className="hover:bg-gray-100">
                        <td className="px-4 py-2 border font-mono">{item.kode_barang}</td>
                        <td className="px-4 py-2 border font-semibold">{item.nama_barang}</td>
                        <td className="px-4 py-2 border text-center">{stokAwal}</td>
                        <td className={`px-4 py-2 border text-center font-semibold ${
                          item.qty === 0 ? 'text-red-600' : item.qty < 10 ? 'text-orange-500' : 'text-green-600'
                        }`}>
                          {item.qty}
                        </td>
                        <td className={`px-4 py-2 border text-center font-semibold ${
                          perubahan > 0 ? 'text-red-600' : perubahan < 0 ? 'text-green-600' : 'text-gray-600'
                        }`}>
                          {perubahan > 0 ? `-${perubahan}` : perubahan}
                        </td>
                        <td className="px-4 py-2 border">
                          Rp {item.harga_beli?.toLocaleString() || '0'}
                        </td>
                        <td className="px-4 py-2 border">
                          Rp {item.harga_jual?.toLocaleString() || '0'}
                        </td>
                        <td className="px-4 py-2 border font-semibold text-blue-600">
                          Rp {nilaiStok.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Ringkasan Laporan Stok */}
            <div className="mt-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-blue-800 mb-3">📊 Ringkasan Laporan Stok</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p><strong>Total Nilai Investasi Stok:</strong> Rp {stokBarang.reduce((sum, item) => sum + (item.harga_beli * item.qty || 0), 0).toLocaleString()}</p>
                  <p><strong>Total Potensi Penjualan:</strong> Rp {stokBarang.reduce((sum, item) => sum + (item.harga_jual * item.qty || 0), 0).toLocaleString()}</p>
                </div>
                <div>
                  <p><strong>Estimasi Keuntungan:</strong> Rp {stokBarang.reduce((sum, item) => sum + ((item.harga_jual - item.harga_beli) * item.qty || 0), 0).toLocaleString()}</p>
                  <p><strong>Barang Perlu Restock:</strong> {stokBarang.filter(item => item.qty < 10).length} item</p>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-indigo-500 to-purple-600">
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <p className="text-lg font-semibold text-gray-800">Loading data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Konten Utama */}
      <div className="flex-1 bg-gradient-to-br from-indigo-500 to-purple-600 p-6 text-white">
        <div className="max-w-7xl mx-auto bg-white rounded-xl shadow-2xl p-6 text-gray-800">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-center md:text-left text-indigo-600 mb-4 md:mb-0">
              🏪 Dashboard Kepala Toko
            </h1>
            <div className="text-sm text-gray-600">
              Login sebagai: <span className="font-semibold">{user?.email}</span>
            </div>
          </div>

          {/* Menu Navigasi - 4 menu sesuai use case */}
          <div className="flex flex-wrap gap-3 justify-center mb-8">
            <button
              className={`px-5 py-3 rounded-lg font-medium shadow transition-all ${
                activeView === "penjualan" 
                  ? "bg-green-600 text-white" 
                  : "bg-green-100 text-green-600 hover:bg-green-200"
              }`}
              onClick={() => setActiveView("penjualan")}
            >
              🛒 Laporan Penjualan
            </button>
            <button
              className={`px-5 py-3 rounded-lg font-medium shadow transition-all ${
                activeView === "pembelian" 
                  ? "bg-orange-600 text-white" 
                  : "bg-orange-100 text-orange-600 hover:bg-orange-200"
              }`}
              onClick={() => setActiveView("pembelian")}
            >
              📥 Laporan Pembelian
            </button>
            <button
              className={`px-5 py-3 rounded-lg font-medium shadow transition-all ${
                activeView === "stok" 
                  ? "bg-blue-600 text-white" 
                  : "bg-blue-100 text-blue-600 hover:bg-blue-200"
              }`}
              onClick={() => setActiveView("stok")}
            >
              📦 Laporan Stok
            </button>
            <button
              className={`px-5 py-3 rounded-lg font-medium shadow transition-all ${
                activeView === "monitoring" 
                  ? "bg-indigo-600 text-white" 
                  : "bg-indigo-100 text-indigo-600 hover:bg-indigo-200"
              }`}
              onClick={() => setActiveView("monitoring")}
            >
              📈 Monitoring Stok
            </button>
            <button
              className="px-5 py-3 bg-red-600 hover:bg-red-700 rounded-lg text-white font-medium shadow transition-all"
              onClick={handleLogout}
            >
              🚪 Logout
            </button>
          </div>

          {/* Konten Dinamis */}
          {renderContent()}
        </div>
      </div>

      {/* Footer - Full width di paling bawah */}
      <footer className="bg-blue-700 text-white text-center py-5 shadow-inner w-full">
        <p className="text-sm tracking-wide">
          &copy; {new Date().getFullYear()} Goku Komunika | Dibuat oleh Raya Rizkyana. All rights reserved.
        </p>
      </footer>
    </div>
  );
}