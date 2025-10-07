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
  const [activeView, setActiveView] = useState("stok"); // stok, inventaris, penjualan, monitoring, analisis
  const [loading, setLoading] = useState(true);
  const [barangTerlaris, setBarangTerlaris] = useState([]);
  const [slowMoving, setSlowMoving] = useState([]);

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

      // Analisis barang Terlaris & slow moving
      analyzeProductPerformance(stokData, penjualanData);

      setLoading(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      setLoading(false);
    }
  };

  // Analisis performa produk
  const analyzeProductPerformance = (stokData, penjualanData) => {
    // Hitung total penjualan per barang
    const productSales = {};
    
    penjualanData.forEach(transaction => {
      transaction.items?.forEach(item => {
        if (!productSales[item.kode_barang]) {
          productSales[item.kode_barang] = {
            nama_barang: item.nama_barang,
            totalTerjual: 0,
            totalRevenue: 0,
            stok: 0
          };
        }
        productSales[item.kode_barang].totalTerjual += item.qty;
        productSales[item.kode_barang].totalRevenue += item.subtotal;
      });
    });

    // Tambah info stok
    stokData.forEach(item => {
      if (productSales[item.kode_barang]) {
        productSales[item.kode_barang].stok = item.qty;
      } else {
        productSales[item.kode_barang] = {
          nama_barang: item.nama_barang,
          totalTerjual: 0,
          totalRevenue: 0,
          stok: item.qty
        };
      }
    });

    // Kategorikan barang
    const Terlaris = [];
    const slowMovingItems = [];

    Object.values(productSales).forEach(product => {
      // Barang Terlaris: penjualan tinggi & stok rendah
      if (product.totalTerjual > 10 && product.stok < 20) {
        Terlaris.push({
          ...product,
          status: "Terlaris",
          rekomendasi: "Tambah Stok"
        });
      }
      // Slow moving: penjualan rendah & stok tinggi
      else if (product.totalTerjual <= 2 && product.stok > 50) {
        slowMovingItems.push({
          ...product,
          status: "Slow Moving",
          rekomendasi: "Diskon/Promosi"
        });
      }
    });

    setBarangTerlaris(Terlaris);
    setSlowMoving(slowMovingItems);
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/");
  };

  // Render konten berdasarkan activeView
  const renderContent = () => {
    switch (activeView) {
      case "stok":
        return (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">📦 Laporan Stok Barang</h2>
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

      case "inventaris":
        return (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">📋 Rekap Inventaris Barang</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-100 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-800">Total Barang</h3>
                <p className="text-2xl font-bold text-blue-600">{stokBarang.length}</p>
              </div>
              <div className="bg-green-100 p-4 rounded-lg">
                <h3 className="font-semibold text-green-800">Stok Normal</h3>
                <p className="text-2xl font-bold text-green-600">
                  {stokBarang.filter(item => item.qty >= 10).length}
                </p>
              </div>
              <div className="bg-red-100 p-4 rounded-lg">
                <h3 className="font-semibold text-red-800">Stok Bermasalah</h3>
                <p className="text-2xl font-bold text-red-600">
                  {stokBarang.filter(item => item.qty < 10).length}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border border-gray-300 rounded-lg">
                <thead className="bg-purple-100">
                  <tr>
                    <th className="px-4 py-2 border">Kode</th>
                    <th className="px-4 py-2 border">Nama Barang</th>
                    <th className="px-4 py-2 border">Stok Awal</th>
                    <th className="px-4 py-2 border">Stok Saat Ini</th>
                    <th className="px-4 py-2 border">Perubahan</th>
                  </tr>
                </thead>
                <tbody>
                  {stokBarang.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-100">
                      <td className="px-4 py-2 border">{item.kode_barang}</td>
                      <td className="px-4 py-2 border">{item.nama_barang}</td>
                      <td className="px-4 py-2 border">{item.stok_awal || item.qty}</td>
                      <td className="px-4 py-2 border">{item.qty}</td>
                      <td className="px-4 py-2 border">
                        {item.stok_awal ? (item.stok_awal - item.qty) : 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case "penjualan":
        return (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">🛒 Laporan Penjualan</h2>
            <div className="overflow-x-auto">
              <table className="w-full border border-gray-300 rounded-lg">
                <thead className="bg-pink-100">
                  <tr>
                    <th className="px-4 py-2 border">Tanggal</th>
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
                      <td className="px-4 py-2 border">{p.namaPembeli || "Tidak ada nama"}</td>
                      <td className="px-4 py-2 border">
                        {p.items?.map((i) => i.nama_barang).join(", ")}
                      </td>
                      <td className="px-4 py-2 border">
                        {p.items?.reduce((sum, item) => sum + item.qty, 0)}
                      </td>
                      <td className="px-4 py-2 border font-semibold">
                        Rp {p.totalHarga?.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case "analisis":
        return (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">📊 Analisis Penjualan</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Barang Terlaris */}
              <div className="bg-white border border-green-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-green-800 mb-3">🚀 Barang Terlaris</h3>
                {barangTerlaris.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full border border-gray-300">
                      <thead className="bg-green-50">
                        <tr>
                          <th className="px-3 py-2 border">Nama Barang</th>
                          <th className="px-3 py-2 border">Terjual</th>
                          <th className="px-3 py-2 border">Stok</th>
                          <th className="px-3 py-2 border">Rekomendasi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {barangTerlaris.map((item, index) => (
                          <tr key={index} className="hover:bg-green-50">
                            <td className="px-3 py-2 border">{item.nama_barang}</td>
                            <td className="px-3 py-2 border text-green-600 font-semibold">
                              {item.totalTerjual}
                            </td>
                            <td className="px-3 py-2 border text-red-600 font-semibold">
                              {item.stok}
                            </td>
                            <td className="px-3 py-2 border text-blue-600">
                              {item.rekomendasi}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500">Tidak ada barang Terlaris</p>
                )}
              </div>

              {/* Slow Moving */}
              <div className="bg-white border border-orange-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-orange-800 mb-3">🐢 Barang Slow Moving</h3>
                {slowMoving.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full border border-gray-300">
                      <thead className="bg-orange-50">
                        <tr>
                          <th className="px-3 py-2 border">Nama Barang</th>
                          <th className="px-3 py-2 border">Terjual</th>
                          <th className="px-3 py-2 border">Stok</th>
                          <th className="px-3 py-2 border">Rekomendasi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slowMoving.map((item, index) => (
                          <tr key={index} className="hover:bg-orange-50">
                            <td className="px-3 py-2 border">{item.nama_barang}</td>
                            <td className="px-3 py-2 border text-orange-600 font-semibold">
                              {item.totalTerjual}
                            </td>
                            <td className="px-3 py-2 border text-green-600 font-semibold">
                              {item.stok}
                            </td>
                            <td className="px-3 py-2 border text-blue-600">
                              {item.rekomendasi}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500">Tidak ada barang slow moving</p>
                )}
              </div>
            </div>
          </div>
        );

      case "monitoring":
        return (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">📈 Monitoring Performa Stok</h2>
            
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

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3">📋 Ringkasan Stok</h3>
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

          {/* Menu Navigasi */}
          <div className="flex flex-wrap gap-3 justify-center mb-8">
            <button
              className={`px-5 py-3 rounded-lg font-medium shadow transition-all ${
                activeView === "stok" 
                  ? "bg-indigo-600 text-white" 
                  : "bg-indigo-100 text-indigo-600 hover:bg-indigo-200"
              }`}
              onClick={() => setActiveView("stok")}
            >
              📦 Laporan Stok
            </button>
            <button
              className={`px-5 py-3 rounded-lg font-medium shadow transition-all ${
                activeView === "inventaris" 
                  ? "bg-purple-600 text-white" 
                  : "bg-purple-100 text-purple-600 hover:bg-purple-200"
              }`}
              onClick={() => setActiveView("inventaris")}
            >
              📋 Rekap Inventaris
            </button>
            <button
              className={`px-5 py-3 rounded-lg font-medium shadow transition-all ${
                activeView === "penjualan" 
                  ? "bg-pink-600 text-white" 
                  : "bg-pink-100 text-pink-600 hover:bg-pink-200"
              }`}
              onClick={() => setActiveView("penjualan")}
            >
              🛒 Laporan Penjualan
            </button>
            <button
              className={`px-5 py-3 rounded-lg font-medium shadow transition-all ${
                activeView === "analisis" 
                  ? "bg-green-600 text-white" 
                  : "bg-green-100 text-green-600 hover:bg-green-200"
              }`}
              onClick={() => setActiveView("analisis")}
            >
              📊 Analisis Penjualan
            </button>
            <button
              className={`px-5 py-3 rounded-lg font-medium shadow transition-all ${
                activeView === "monitoring" 
                  ? "bg-yellow-600 text-white" 
                  : "bg-yellow-100 text-yellow-600 hover:bg-yellow-200"
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