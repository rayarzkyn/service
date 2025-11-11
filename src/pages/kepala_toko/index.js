import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../firebase/config";
import { 
  collection, 
  getDocs, 
  addDoc, 
  query, 
  orderBy, 
  where, 
  serverTimestamp,
  updateDoc,
  doc,
  increment
} from "firebase/firestore";

export default function KepalaTokoDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [stokBarang, setStokBarang] = useState([]);
  const [penjualan, setPenjualan] = useState([]);
  const [pembelian, setPembelian] = useState([]);
  const [service, setService] = useState([]);
  const [activeView, setActiveView] = useState("pembelian");
  const [loading, setLoading] = useState(true);
  
  // State untuk input pembelian - SESUAI STRUCTURE FIREBASE
  const [newPembelian, setNewPembelian] = useState({
    noPembelian: "",
    namaSupplier: "", // Sesuai field di Firebase
    tanggal: new Date().toISOString().split('T')[0],
    items: [],
    totalHarga: 0,
    pembayaran: 0,
    kembalian: 0,
    keterangan: ""
  });
  const [searchBarang, setSearchBarang] = useState("");

  // State untuk laporan pembelian
  const [laporanPembelian, setLaporanPembelian] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    supplierFilter: "",
    totalPembelian: 0,
    totalItem: 0
  });

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

      // Data pembelian - SESUAI STRUCTURE FIREBASE
      const pembelianQuery = query(collection(db, "pembelian"), orderBy("tanggal", "desc"));
      const pembelianSnap = await getDocs(pembelianQuery);
      const pembelianData = pembelianSnap.docs.map((doc) => ({ 
        id: doc.id, 
        ...doc.data(),
        tanggal: doc.data().tanggal?.toDate?.() || new Date(),
        namaSupplier: doc.data().namaSupplier || "Tidak ada supplier", // Handle jika tidak ada supplier
        totalHarga: doc.data().totalHarga || 0
      }));
      setPembelian(pembelianData);

      // Data service
      const serviceQuery = query(collection(db, "service"), orderBy("tanggalMasuk", "desc"));
      const serviceSnap = await getDocs(serviceQuery);
      const serviceData = serviceSnap.docs.map((doc) => ({ 
        id: doc.id, 
        ...doc.data(),
        tanggalMasuk: doc.data().tanggalMasuk?.toDate?.() || new Date(),
        formattedDate: doc.data().tanggalMasuk?.toDate?.().toLocaleString('id-ID') || '-'
      }));
      setService(serviceData);

      setLoading(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      setLoading(false);
    }
  };

  // Fungsi untuk generate nomor pembelian otomatis
  const generateNomorPembelian = async () => {
    try {
      const today = new Date();
      const dateString = today.toISOString().split('T')[0].replace(/-/g, '');
      
      // Cari pembelian hari ini
      const startOfDay = new Date(today);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);
      
      const pembelianQuery = query(
        collection(db, "pembelian"),
        where("tanggal", ">=", startOfDay),
        where("tanggal", "<=", endOfDay),
        orderBy("tanggal", "desc")
      );
      
      const pembelianSnap = await getDocs(pembelianQuery);
      const jumlahHariIni = pembelianSnap.size;
      
      // Format: PO/YYYYMMDD/001
      const nomorUrut = String(jumlahHariIni + 1).padStart(3, '0');
      const noPembelian = `PO/${dateString}/${nomorUrut}`;
      
      return noPembelian;
    } catch (error) {
      console.error("Error generating nomor pembelian:", error);
      // Fallback: gunakan timestamp jika error
      return `PO/${Date.now()}`;
    }
  };

  // Auto-generate nomor pembelian ketika form dibuka
  useEffect(() => {
    if (activeView === "pembelian" && newPembelian.noPembelian === "") {
      generateNomorPembelian().then(noPembelian => {
        setNewPembelian(prev => ({
          ...prev,
          noPembelian: noPembelian
        }));
      });
    }
  }, [activeView]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/");
  };

  // Fungsi untuk input pembelian
  const handleAddPembelianItem = () => {
    setNewPembelian({
      ...newPembelian,
      items: [...newPembelian.items, { 
        kode_barang: '', 
        nama_barang: '', 
        qty: 1, 
        harga_beli: 0, 
        subtotal: 0 
      }]
    });
  };

  const handleUpdatePembelianItem = (index, field, value) => {
    const updatedItems = [...newPembelian.items];
    
    if (field === 'nama_barang') {
      const selectedProduct = stokBarang.find(item => item.nama_barang === value);
      if (selectedProduct) {
        updatedItems[index] = {
          ...updatedItems[index],
          kode_barang: selectedProduct.kode_barang,
          nama_barang: value,
          harga_beli: selectedProduct.harga_beli || 0,
          subtotal: (selectedProduct.harga_beli || 0) * updatedItems[index].qty
        };
      }
    } else if (field === 'qty') {
      const qty = Math.max(1, Number(value));
      updatedItems[index] = {
        ...updatedItems[index],
        qty: qty,
        subtotal: qty * updatedItems[index].harga_beli
      };
    } else if (field === 'harga_beli') {
      const harga = Math.max(0, Number(value));
      updatedItems[index] = {
        ...updatedItems[index],
        harga_beli: harga,
        subtotal: harga * updatedItems[index].qty
      };
    }

    const totalHarga = updatedItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    
    setNewPembelian({
      ...newPembelian,
      items: updatedItems,
      totalHarga: totalHarga
    });
  };

  const handleRemovePembelianItem = (index) => {
    const updatedItems = newPembelian.items.filter((_, i) => i !== index);
    const totalHarga = updatedItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    
    setNewPembelian({
      ...newPembelian,
      items: updatedItems,
      totalHarga: totalHarga
    });
  };

  // Handle perubahan pembayaran dan hitung kembalian
  const handlePembayaranChange = (value) => {
    const pembayaran = Math.max(0, Number(value));
    const kembalian = Math.max(0, pembayaran - newPembelian.totalHarga);
    
    setNewPembelian({
      ...newPembelian,
      pembayaran: pembayaran,
      kembalian: kembalian
    });
  };

  const handleSubmitPembelian = async () => {
    if (!newPembelian.namaSupplier || !newPembelian.noPembelian || newPembelian.items.length === 0) {
      alert('Supplier dan minimal 1 barang harus diisi!');
      return;
    }

    try {
      // Generate ulang nomor pembelian untuk memastikan tidak duplikat
      const finalNoPembelian = await generateNomorPembelian();

      // Simpan data pembelian - SESUAI STRUCTURE FIREBASE
      await addDoc(collection(db, "pembelian"), {
        ...newPembelian,
        noPembelian: finalNoPembelian,
        namaSupplier: newPembelian.namaSupplier, // Gunakan namaSupplier sesuai Firebase
        tanggal: serverTimestamp(),
        userId: user.uid,
        createdAt: serverTimestamp()
      });

      // Update stok barang
      const updatePromises = newPembelian.items.map(async (item) => {
        const existingProduct = stokBarang.find(p => p.nama_barang === item.nama_barang);
        if (existingProduct) {
          const productRef = collection(db, "stok");
          const q = query(productRef, where("nama_barang", "==", item.nama_barang));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            const docRef = doc(db, "stok", querySnapshot.docs[0].id);
            await updateDoc(docRef, {
              qty: increment(item.qty),
              harga_beli: item.harga_beli,
              updated_at: serverTimestamp()
            });
          }
        } else {
          // Jika barang baru, tambahkan ke stok
          await addDoc(collection(db, "stok"), {
            kode_barang: item.kode_barang,
            nama_barang: item.nama_barang,
            qty: item.qty,
            terpakai: 0,
            harga_beli: item.harga_beli,
            harga_jual: item.harga_beli * 1.5, // Markup 50%
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
          });
        }
      });

      await Promise.all(updatePromises);

      // Reset form
      setNewPembelian({
        noPembelian: "", // Akan di-generate ulang oleh useEffect
        namaSupplier: "", // Reset namaSupplier
        tanggal: new Date().toISOString().split('T')[0],
        items: [],
        totalHarga: 0,
        pembayaran: 0,
        kembalian: 0,
        keterangan: ""
      });
      setSearchBarang("");

      alert('Pembelian berhasil dicatat!');
      fetchAllData();
    } catch (error) {
      console.error("Error submitting pembelian:", error);
      alert(`Gagal mencatat pembelian: ${error.message}`);
    }
  };

  // Filter barang untuk pencarian
  const filteredBarang = stokBarang
    .filter(item => 
      item.nama_barang.toLowerCase().includes(searchBarang.toLowerCase()) ||
      item.kode_barang.toLowerCase().includes(searchBarang.toLowerCase())
    )
    .sort((a, b) => a.nama_barang.localeCompare(b.nama_barang));

  // Hitung total penjualan
  const totalPenjualan = penjualan.reduce((sum, p) => sum + (p.totalHarga || 0), 0);
  
  // Hitung total pembelian
  const totalPembelian = pembelian.reduce((sum, p) => sum + (p.totalHarga || 0), 0);

  // Hitung total service
  const calculateTotalBiayaService = (serviceItem) => {
    const biayaService = serviceItem.biaya || 0;
    const biayaSparepart = serviceItem.sparepartsUsed?.reduce((total, item) => {
      const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
      return total + ((sparepart?.harga_jual || 0) * item.qty);
    }, 0) || 0;
    return biayaService + biayaSparepart;
  };

  const totalService = service.reduce((sum, s) => sum + calculateTotalBiayaService(s), 0);

  // Fungsi untuk laporan pembelian
  const generateLaporanPembelian = () => {
    const startDate = new Date(laporanPembelian.startDate);
    const endDate = new Date(laporanPembelian.endDate);
    endDate.setHours(23, 59, 59, 999);

    const filteredPembelian = pembelian.filter(p => {
      const tanggalPembelian = p.tanggal;
      const matchesDate = tanggalPembelian >= startDate && tanggalPembelian <= endDate;
      const matchesSupplier = !laporanPembelian.supplierFilter || 
        p.namaSupplier?.toLowerCase().includes(laporanPembelian.supplierFilter.toLowerCase());
      
      return matchesDate && matchesSupplier;
    });

    const totalPembelian = filteredPembelian.reduce((sum, p) => sum + (p.totalHarga || 0), 0);
    const totalItem = filteredPembelian.reduce((sum, p) => 
      sum + (p.items?.reduce((itemSum, item) => itemSum + (item.qty || 0), 0) || 0), 0
    );

    return {
      data: filteredPembelian,
      totalPembelian,
      totalItem
    };
  };

  const handleExportLaporanPembelian = () => {
    const laporan = generateLaporanPembelian();
    const csvContent = "data:text/csv;charset=utf-8," +
      "Laporan Pembelian\n" +
      `Periode: ${laporanPembelian.startDate} hingga ${laporanPembelian.endDate}\n` +
      `Supplier: ${laporanPembelian.supplierFilter || "Semua Supplier"}\n\n` +
      "Tanggal,No Pembelian,Supplier,Total Harga,Jumlah Item\n" +
      laporan.data.map(p => 
        `${p.tanggal?.toLocaleDateString("id-ID")},"${p.noPembelian}","${p.namaSupplier}",${p.totalHarga},${p.items?.reduce((sum, item) => sum + (item.qty || 0), 0)}`
      ).join("\n") +
      `\n\nTotal Pembelian: ${laporan.totalPembelian.toLocaleString()}\n` +
      `Total Item: ${laporan.totalItem}`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `laporan-pembelian-${laporanPembelian.startDate}-${laporanPembelian.endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Render konten berdasarkan activeView
  const renderContent = () => {
    switch (activeView) {
      case "pembelian":
        return (
          <div className="space-y-8">
            {/* Header Section dengan Gradient */}
            <div className="text-center mb-8 relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-3xl blur-xl"></div>
              <h2 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent mb-4 relative">
                🛒 Input Pembelian Barang
              </h2>
              <p className="text-slate-600 max-w-2xl mx-auto text-lg relative">
                Kelola pembelian barang baru dan update stok secara otomatis
              </p>
            </div>
            
            {/* Form Input Pembelian */}
            <div className="bg-gradient-to-br from-white to-blue-50 rounded-3xl shadow-2xl border border-blue-100/50 p-8 backdrop-blur-sm">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-blue-700">No. Pembelian*</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={newPembelian.noPembelian}
                      readOnly
                      className="w-full p-4 pl-12 border-2 border-blue-200 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-blue-50/50 cursor-not-allowed shadow-sm"
                      placeholder="Sistem akan generate otomatis"
                    />
                    <i className="fas fa-hashtag absolute left-4 top-1/2 transform -translate-y-1/2 text-blue-500"></i>
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-semibold">
                        Auto
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-blue-600 mt-2 font-medium">
                    ✅ Nomor pembelian digenerate otomatis oleh sistem
                  </p>
                </div>
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-blue-700">Supplier*</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={newPembelian.namaSupplier}
                      onChange={(e) => setNewPembelian({...newPembelian, namaSupplier: e.target.value})}
                      className="w-full p-4 pl-12 border-2 border-blue-200 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white hover:bg-blue-50/50 shadow-sm"
                      placeholder="Nama supplier"
                      required
                    />
                    <i className="fas fa-truck absolute left-4 top-1/2 transform -translate-y-1/2 text-blue-500"></i>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-blue-700">Tanggal</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={newPembelian.tanggal}
                      onChange={(e) => setNewPembelian({...newPembelian, tanggal: e.target.value})}
                      className="w-full p-4 pl-12 border-2 border-blue-200 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white hover:bg-blue-50/50 shadow-sm"
                    />
                    <i className="fas fa-calendar-alt absolute left-4 top-1/2 transform -translate-y-1/2 text-blue-500"></i>
                  </div>
                </div>
              </div>

              <div className="mb-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                    <span className="bg-blue-100 text-blue-600 p-2 rounded-xl">📦</span>
                    Barang yang Dibeli
                  </h3>
                  <span className="text-sm font-bold text-blue-600 bg-blue-100 px-4 py-2 rounded-full shadow-sm">
                    {newPembelian.items.length} item
                  </span>
                </div>
                
                <div className="mb-6">
                  <label className="block text-sm font-bold mb-3 text-blue-700 flex items-center gap-2">
                    <i className="fas fa-search"></i>
                    Cari Barang
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Cari barang berdasarkan nama atau kode..."
                      value={searchBarang}
                      onChange={(e) => setSearchBarang(e.target.value)}
                      className="w-full p-4 pl-12 border-2 border-blue-200 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white hover:bg-blue-50/50 shadow-sm"
                    />
                    <i className="fas fa-search absolute left-4 top-1/2 transform -translate-y-1/2 text-blue-500"></i>
                  </div>
                  {searchBarang && (
                    <p className="text-sm text-blue-600 mt-3 font-bold bg-blue-50 px-4 py-2 rounded-xl">
                      🎯 Menampilkan {filteredBarang.length} barang ditemukan
                    </p>
                  )}
                </div>
                
                <div className="space-y-4">
                  {newPembelian.items.map((item, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center p-6 bg-gradient-to-r from-blue-50/50 to-cyan-50/50 rounded-2xl border-2 border-blue-200/50 hover:border-blue-400 transition-all duration-300 shadow-sm">
                      <div className="md:col-span-5">
                        <select
                          value={item.nama_barang}
                          onChange={(e) => handleUpdatePembelianItem(index, 'nama_barang', e.target.value)}
                          className="w-full p-4 border-2 border-blue-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white text-sm font-medium"
                        >
                          <option value="">Pilih Barang</option>
                          {filteredBarang.map(product => (
                            <option key={product.id} value={product.nama_barang}>
                              {product.nama_barang}
                              {product.kode_barang && ` (${product.kode_barang})`}
                              - Stok: {product.qty}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <input
                          type="number"
                          value={item.qty}
                          onChange={(e) => handleUpdatePembelianItem(index, 'qty', e.target.value)}
                          className="w-full p-4 border-2 border-blue-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white text-center font-bold"
                          min="1"
                          placeholder="Qty"
                        />
                      </div>
                      <div className="md:col-span-3">
                        <input
                          type="number"
                          value={item.harga_beli}
                          onChange={(e) => handleUpdatePembelianItem(index, 'harga_beli', e.target.value)}
                          className="w-full p-4 border-2 border-blue-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white font-bold"
                          min="0"
                          placeholder="Harga Beli"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <div className="p-4 text-sm font-bold text-blue-600 bg-white rounded-xl border-2 border-blue-200 text-center shadow-sm">
                          Rp {item.subtotal?.toLocaleString()}
                        </div>
                      </div>
                      <div className="md:col-span-1 flex justify-center">
                        <button
                          onClick={() => handleRemovePembelianItem(index)}
                          className="text-rose-500 hover:text-rose-700 p-3 hover:bg-rose-50 rounded-xl transition-all duration-300 transform hover:scale-110"
                        >
                          <i className="fas fa-times-circle text-xl"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleAddPembelianItem}
                  className="w-full text-blue-600 font-bold text-lg flex items-center justify-center gap-3 mt-6 p-5 hover:bg-blue-50 rounded-2xl transition-all duration-300 border-2 border-dashed border-blue-300 hover:border-blue-500 hover:shadow-lg transform hover:-translate-y-1"
                >
                  <i className="fas fa-plus-circle text-blue-500 text-xl"></i> 
                  <span>Tambah Barang Baru</span>
                </button>
              </div>

              {/* Total Harga & Pembayaran */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="flex justify-between items-center p-6 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl border border-blue-300 shadow-lg">
                  <span className="text-lg font-bold text-white">Total Pembelian:</span>
                  <span className="text-2xl font-bold text-white">
                    Rp {newPembelian.totalHarga.toLocaleString()}
                  </span>
                </div>
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-blue-700">Pembayaran</label>
                  <input
                    type="number"
                    value={newPembelian.pembayaran}
                    onChange={(e) => handlePembayaranChange(e.target.value)}
                    className="w-full p-4 border-2 border-blue-200 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white shadow-sm"
                    min="0"
                    placeholder="Jumlah pembayaran"
                  />
                </div>
                <div className="flex justify-between items-center p-6 bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl border border-green-300 shadow-lg">
                  <span className="text-lg font-bold text-white">Kembalian:</span>
                  <span className="text-2xl font-bold text-white">
                    Rp {newPembelian.kembalian.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-bold mb-3 text-blue-700">Keterangan</label>
                <textarea
                  value={newPembelian.keterangan}
                  onChange={(e) => setNewPembelian({...newPembelian, keterangan: e.target.value})}
                  className="w-full p-4 border-2 border-blue-200 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 bg-white hover:bg-blue-50/50 resize-none shadow-sm"
                  rows={3}
                  placeholder="Tambahkan keterangan pembelian..."
                />
              </div>

              <button 
                onClick={handleSubmitPembelian}
                className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white px-8 py-5 rounded-2xl font-bold text-xl shadow-2xl hover:shadow-3xl transition-all duration-300 flex items-center justify-center gap-3 transform hover:-translate-y-1"
              >
                <i className="fas fa-save text-xl"></i> 
                <span>💾 Simpan Pembelian</span>
              </button>
            </div>

            {/* Riwayat Pembelian - DIPERBAIKI UNTUK MENAMPILKAN SUPPLIER */}
            <div className="bg-gradient-to-br from-white to-blue-50 rounded-3xl shadow-2xl border border-blue-100/50 overflow-hidden">
              <div className="p-8 bg-gradient-to-r from-blue-500 to-cyan-500 border-b border-blue-200">
                <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                  <i className="fas fa-history"></i>
                  Riwayat Pembelian
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-blue-100 to-cyan-100">
                      <th className="p-6 border-b border-blue-200 text-blue-800 font-bold text-left text-lg">Tanggal</th>
                      <th className="p-6 border-b border-blue-200 text-blue-800 font-bold text-left text-lg">No. Pembelian</th>
                      <th className="p-6 border-b border-blue-200 text-blue-800 font-bold text-left text-lg">Supplier</th>
                      <th className="p-6 border-b border-blue-200 text-blue-800 font-bold text-left text-lg">Barang</th>
                      <th className="p-6 border-b border-blue-200 text-blue-800 font-bold text-center text-lg">Qty</th>
                      <th className="p-6 border-b border-blue-200 text-blue-800 font-bold text-center text-lg">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pembelian.map((p) => (
                      <tr key={p.id} className="hover:bg-blue-50/50 transition-colors duration-200 border-b border-blue-100">
                        <td className="p-6 font-semibold text-slate-700">
                          {p.tanggal?.toLocaleDateString("id-ID")}
                        </td>
                        <td className="p-6 font-mono text-base bg-blue-50 rounded-xl text-blue-700 font-bold border border-blue-200">
                          {p.noPembelian || `PO-${p.id.slice(-8).toUpperCase()}`}
                        </td>
                        <td className="p-6 font-semibold text-slate-800">
                          {p.namaSupplier || "Tidak ada supplier"}
                        </td>
                        <td className="p-6">
                          <div className="text-base text-slate-600 font-medium">
                            {p.items?.slice(0, 2).map((i, idx) => (
                              <div key={idx} className="mb-1">
                                {i.nama_barang} ({i.qty}x)
                              </div>
                            ))}
                            {p.items?.length > 2 && (
                              <div className="text-blue-600 font-semibold">
                                + {p.items.length - 2} barang lainnya
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-6 text-center font-bold text-blue-600 text-lg">
                          {p.items?.reduce((sum, item) => sum + (item.qty || 0), 0)}
                        </td>
                        <td className="p-6 text-center font-bold text-green-600 text-lg">
                          Rp {(p.totalHarga || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case "laporan-pembelian":
        const laporan = generateLaporanPembelian();
        return (
          <div className="space-y-8">
            <div className="text-center mb-8 relative">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 rounded-3xl blur-xl"></div>
              <h2 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-4 relative">
                📊 Laporan Pembelian
              </h2>
              <p className="text-slate-600 max-w-2xl mx-auto text-lg relative">
                Analisis dan monitor semua transaksi pembelian dengan filter yang lengkap
              </p>
            </div>

            {/* Filter Section */}
            <div className="bg-gradient-to-br from-white to-indigo-50 rounded-3xl shadow-2xl border border-indigo-100/50 p-8 backdrop-blur-sm">
              <h3 className="text-2xl font-bold text-indigo-800 mb-6 flex items-center gap-3">
                <i className="fas fa-filter"></i>
                Filter Laporan
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-indigo-700">Tanggal Mulai</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={laporanPembelian.startDate}
                      onChange={(e) => setLaporanPembelian({...laporanPembelian, startDate: e.target.value})}
                      className="w-full p-4 pl-12 border-2 border-indigo-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-300 bg-white shadow-sm"
                    />
                    <i className="fas fa-calendar-day absolute left-4 top-1/2 transform -translate-y-1/2 text-indigo-500"></i>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-indigo-700">Tanggal Akhir</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={laporanPembelian.endDate}
                      onChange={(e) => setLaporanPembelian({...laporanPembelian, endDate: e.target.value})}
                      className="w-full p-4 pl-12 border-2 border-indigo-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-300 bg-white shadow-sm"
                    />
                    <i className="fas fa-calendar-day absolute left-4 top-1/2 transform -translate-y-1/2 text-indigo-500"></i>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-indigo-700">Filter Supplier</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={laporanPembelian.supplierFilter}
                      onChange={(e) => setLaporanPembelian({...laporanPembelian, supplierFilter: e.target.value})}
                      className="w-full p-4 pl-12 border-2 border-indigo-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-300 bg-white shadow-sm"
                      placeholder="Nama supplier..."
                    />
                    <i className="fas fa-truck absolute left-4 top-1/2 transform -translate-y-1/2 text-indigo-500"></i>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-indigo-700">Aksi</label>
                  <button
                    onClick={handleExportLaporanPembelian}
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white px-6 py-4 rounded-2xl font-bold shadow-2xl hover:shadow-3xl transition-all duration-300 flex items-center justify-center gap-3 transform hover:-translate-y-1"
                  >
                    <i className="fas fa-file-export"></i>
                    Export CSV
                  </button>
                </div>
              </div>
            </div>

            {/* Statistik */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white p-8 rounded-3xl shadow-2xl transform hover:-translate-y-2 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-indigo-100 text-sm font-medium">Total Transaksi</p>
                    <p className="text-4xl font-bold mt-3">{laporan.data.length}</p>
                  </div>
                  <i className="fas fa-receipt text-3xl opacity-90"></i>
                </div>
              </div>
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-8 rounded-3xl shadow-2xl transform hover:-translate-y-2 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-100 text-sm font-medium">Total Pembelian</p>
                    <p className="text-3xl font-bold mt-3">Rp {laporan.totalPembelian.toLocaleString()}</p>
                  </div>
                  <i className="fas fa-money-bill-wave text-3xl opacity-90"></i>
                </div>
              </div>
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-8 rounded-3xl shadow-2xl transform hover:-translate-y-2 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-100 text-sm font-medium">Total Item</p>
                    <p className="text-4xl font-bold mt-3">{laporan.totalItem}</p>
                  </div>
                  <i className="fas fa-boxes text-3xl opacity-90"></i>
                </div>
              </div>
            </div>

            {/* Tabel Laporan */}
            <div className="bg-gradient-to-br from-white to-indigo-50 rounded-3xl shadow-2xl border border-indigo-100/50 overflow-hidden">
              <div className="p-8 bg-gradient-to-r from-indigo-500 to-purple-500 border-b border-indigo-200">
                <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                  <i className="fas fa-chart-bar"></i>
                  Detail Laporan Pembelian
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-indigo-100 to-purple-100">
                      <th className="p-6 border-b border-indigo-200 text-indigo-800 font-bold text-left text-lg">Tanggal</th>
                      <th className="p-6 border-b border-indigo-200 text-indigo-800 font-bold text-left text-lg">No. Pembelian</th>
                      <th className="p-6 border-b border-indigo-200 text-indigo-800 font-bold text-left text-lg">Supplier</th>
                      <th className="p-6 border-b border-indigo-200 text-indigo-800 font-bold text-left text-lg">Barang</th>
                      <th className="p-6 border-b border-indigo-200 text-indigo-800 font-bold text-center text-lg">Qty</th>
                      <th className="p-6 border-b border-indigo-200 text-indigo-800 font-bold text-right text-lg">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {laporan.data.map((p) => (
                      <tr key={p.id} className="hover:bg-indigo-50/50 transition-colors duration-200 border-b border-indigo-100">
                        <td className="p-6 font-semibold text-slate-700">
                          {p.tanggal?.toLocaleDateString("id-ID")}
                        </td>
                        <td className="p-6 font-mono text-base bg-indigo-50 text-indigo-700 rounded-xl font-bold border border-indigo-200">
                          {p.noPembelian || `PO-${p.id.slice(-8).toUpperCase()}`}
                        </td>
                        <td className="p-6 font-bold text-slate-800">{p.namaSupplier || "Tidak ada supplier"}</td>
                        <td className="p-6">
                          <div className="text-base text-slate-600 font-medium">
                            {p.items?.slice(0, 2).map((i, idx) => (
                              <div key={idx} className="mb-1">
                                {i.nama_barang} ({i.qty}x)
                              </div>
                            ))}
                            {p.items?.length > 2 && (
                              <div className="text-indigo-600 font-semibold">
                                + {p.items.length - 2} barang lainnya
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-6 text-center font-bold text-blue-600 text-lg">
                          {p.items?.reduce((sum, item) => sum + (item.qty || 0), 0)}
                        </td>
                        <td className="p-6 font-bold text-green-600 text-right text-lg">
                          Rp {(p.totalHarga || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {laporan.data.length === 0 && (
                      <tr>
                        <td colSpan="6" className="p-8 text-center text-slate-500 font-medium text-lg">
                          <i className="fas fa-inbox text-4xl mb-4 text-slate-300"></i>
                          <br />
                          Tidak ada data pembelian untuk periode yang dipilih
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case "service":
        return (
          <div className="space-y-8">
            <div className="text-center mb-8 relative">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-3xl blur-xl"></div>
              <h2 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-4 relative">
                🔧 Laporan Service
              </h2>
              <p className="text-slate-600 max-w-2xl mx-auto text-lg relative">
                Monitor semua aktivitas service dan pendapatan dari layanan perbaikan
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-8 rounded-3xl shadow-2xl transform hover:-translate-y-2 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-100 text-sm font-medium">Total Service</p>
                    <p className="text-4xl font-bold mt-3">{service.length}</p>
                  </div>
                  <i className="fas fa-tools text-3xl opacity-90"></i>
                </div>
              </div>
              <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white p-8 rounded-3xl shadow-2xl transform hover:-translate-y-2 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-indigo-100 text-sm font-medium">Total Pendapatan</p>
                    <p className="text-3xl font-bold mt-3">Rp {totalService.toLocaleString()}</p>
                  </div>
                  <i className="fas fa-money-bill-wave text-3xl opacity-90"></i>
                </div>
              </div>
              <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-8 rounded-3xl shadow-2xl transform hover:-translate-y-2 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-100 text-sm font-medium">Selesai</p>
                    <p className="text-4xl font-bold mt-3">
                      {service.filter(s => s.status === 'Sudah Selesai').length}
                    </p>
                  </div>
                  <i className="fas fa-check-circle text-3xl opacity-90"></i>
                </div>
              </div>
              <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-8 rounded-3xl shadow-2xl transform hover:-translate-y-2 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-orange-100 text-sm font-medium">Dalam Proses</p>
                    <p className="text-4xl font-bold mt-3">
                      {service.filter(s => s.status === 'Dalam Proses').length}
                    </p>
                  </div>
                  <i className="fas fa-sync-alt text-3xl opacity-90"></i>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-white to-purple-50 rounded-3xl shadow-2xl border border-purple-100/50 overflow-hidden">
              <div className="p-8 bg-gradient-to-r from-purple-500 to-pink-500 border-b border-purple-200">
                <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                  <i className="fas fa-list-alt"></i>
                  Detail Laporan Service
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-purple-100 to-pink-100">
                      <th className="p-6 border-b border-purple-200 text-purple-800 font-bold text-left text-lg">Tanggal</th>
                      <th className="p-6 border-b border-purple-200 text-purple-800 font-bold text-left text-lg">ID Service</th>
                      <th className="p-6 border-b border-purple-200 text-purple-800 font-bold text-left text-lg">Pelanggan</th>
                      <th className="p-6 border-b border-purple-200 text-purple-800 font-bold text-left text-lg">Merk HP</th>
                      <th className="p-6 border-b border-purple-200 text-purple-800 font-bold text-left text-lg">Kerusakan</th>
                      <th className="p-6 border-b border-purple-200 text-purple-800 font-bold text-left text-lg">Status</th>
                      <th className="p-6 border-b border-purple-200 text-purple-800 font-bold text-right text-lg">Total Biaya</th>
                    </tr>
                  </thead>
                  <tbody>
                    {service.map((s) => (
                      <tr key={s.id} className="hover:bg-purple-50/50 transition-colors duration-200 border-b border-purple-100">
                        <td className="p-6 font-semibold text-slate-700">
                          {s.tanggalMasuk?.toLocaleDateString("id-ID")}
                        </td>
                        <td className="p-6 font-mono text-base bg-purple-50 text-purple-700 rounded-xl font-bold border border-purple-200">
                          {s.serviceId || s.id.slice(-8).toUpperCase()}
                        </td>
                        <td className="p-6 font-bold text-slate-800">{s.namaPelanggan}</td>
                        <td className="p-6 text-slate-700 font-medium">{s.merkHP}</td>
                        <td className="p-6 text-base text-slate-600 max-w-xs font-medium">{s.kerusakan || "-"}</td>
                        <td className="p-6">
                          <span className={`px-4 py-2 rounded-full text-sm font-bold ${
                            s.status === 'Sudah Selesai' ? 'bg-green-100 text-green-800 border border-green-200' :
                            s.status === 'Dalam Proses' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
                            s.status === 'Menunggu Konfirmasi' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                            'bg-red-100 text-red-800 border border-red-200'
                          }`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="p-6 font-bold text-green-600 text-right text-lg">
                          Rp {calculateTotalBiayaService(s).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case "penjualan":
        return (
          <div className="space-y-8">
            <div className="text-center mb-8 relative">
              <div className="absolute inset-0 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-3xl blur-xl"></div>
              <h2 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent mb-4 relative">
                🛒 Laporan Penjualan
              </h2>
              <p className="text-slate-600 max-w-2xl mx-auto text-lg relative">
                Analisis performa penjualan dan tracking transaksi retail
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-8 rounded-3xl shadow-2xl transform hover:-translate-y-2 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-100 text-sm font-medium">Total Transaksi</p>
                    <p className="text-4xl font-bold mt-3">{penjualan.length}</p>
                  </div>
                  <i className="fas fa-receipt text-3xl opacity-90"></i>
                </div>
              </div>
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-8 rounded-3xl shadow-2xl transform hover:-translate-y-2 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-100 text-sm font-medium">Total Penjualan</p>
                    <p className="text-3xl font-bold mt-3">Rp {totalPenjualan.toLocaleString()}</p>
                  </div>
                  <i className="fas fa-chart-line text-3xl opacity-90"></i>
                </div>
              </div>
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-8 rounded-3xl shadow-2xl transform hover:-translate-y-2 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-100 text-sm font-medium">Rata-rata/Transaksi</p>
                    <p className="text-3xl font-bold mt-3">
                      Rp {penjualan.length > 0 ? (totalPenjualan / penjualan.length).toLocaleString('id-ID', {maximumFractionDigits: 0}) : '0'}
                    </p>
                  </div>
                  <i className="fas fa-calculator text-3xl opacity-90"></i>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-white to-green-50 rounded-3xl shadow-2xl border border-green-100/50 overflow-hidden">
              <div className="p-8 bg-gradient-to-r from-green-500 to-emerald-500 border-b border-green-200">
                <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                  <i className="fas fa-chart-bar"></i>
                  Detail Laporan Penjualan
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-green-100 to-emerald-100">
                      <th className="p-6 border-b border-green-200 text-green-800 font-bold text-left text-lg">Tanggal</th>
                      <th className="p-6 border-b border-green-200 text-green-800 font-bold text-left text-lg">No. Transaksi</th>
                      <th className="p-6 border-b border-green-200 text-green-800 font-bold text-left text-lg">Nama Pembeli</th>
                      <th className="p-6 border-b border-green-200 text-green-800 font-bold text-left text-lg">Barang</th>
                      <th className="p-6 border-b border-green-200 text-green-800 font-bold text-center text-lg">Qty</th>
                      <th className="p-6 border-b border-green-200 text-green-800 font-bold text-right text-lg">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {penjualan.map((p) => (
                      <tr key={p.id} className="hover:bg-green-50/50 transition-colors duration-200 border-b border-green-100">
                        <td className="p-6 font-semibold text-slate-700">
                          {p.tanggal?.toLocaleDateString("id-ID")}
                        </td>
                        <td className="p-6 font-mono text-base bg-green-50 text-green-700 rounded-xl font-bold border border-green-200">
                          {p.noTransaksi || p.id.slice(-8).toUpperCase()}
                        </td>
                        <td className="p-6 font-bold text-slate-800">{p.namaPembeli || "Tidak ada nama"}</td>
                        <td className="p-6 text-slate-600 font-medium">
                          {p.items?.map((i) => i.nama_barang).join(", ")}
                        </td>
                        <td className="p-6 text-center font-bold text-blue-600 text-lg">
                          {p.items?.reduce((sum, item) => sum + item.qty, 0)}
                        </td>
                        <td className="p-6 font-bold text-green-600 text-right text-lg">
                          Rp {p.totalHarga?.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case "stok":
        return (
          <div className="space-y-8">
            <div className="text-center mb-8 relative">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 to-red-500/10 rounded-3xl blur-xl"></div>
              <h2 className="text-4xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent mb-4 relative">
                📦 Monitoring Stok Barang
              </h2>
              <p className="text-slate-600 max-w-2xl mx-auto text-lg relative">
                Pantau kondisi stok barang dan analisis nilai inventory secara real-time
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-8 rounded-3xl shadow-2xl transform hover:-translate-y-2 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-100 text-sm font-medium">Total Barang</p>
                    <p className="text-4xl font-bold mt-3">{stokBarang.length}</p>
                  </div>
                  <i className="fas fa-boxes text-3xl opacity-90"></i>
                </div>
              </div>
              <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-8 rounded-3xl shadow-2xl transform hover:-translate-y-2 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-100 text-sm font-medium">Nilai Total Stok</p>
                    <p className="text-3xl font-bold mt-3">
                      Rp {stokBarang.reduce((sum, item) => sum + (item.harga_jual * item.qty || 0), 0).toLocaleString()}
                    </p>
                  </div>
                  <i className="fas fa-coins text-3xl opacity-90"></i>
                </div>
              </div>
              <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-8 rounded-3xl shadow-2xl transform hover:-translate-y-2 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-orange-100 text-sm font-medium">Stok Rendah</p>
                    <p className="text-4xl font-bold mt-3">
                      {stokBarang.filter(item => item.qty < 10 && item.qty > 0).length}
                    </p>
                  </div>
                  <i className="fas fa-exclamation-triangle text-3xl opacity-90"></i>
                </div>
              </div>
              <div className="bg-gradient-to-br from-red-500 to-red-600 text-white p-8 rounded-3xl shadow-2xl transform hover:-translate-y-2 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-red-100 text-sm font-medium">Stok Habis</p>
                    <p className="text-4xl font-bold mt-3">
                      {stokBarang.filter(item => item.qty === 0).length}
                    </p>
                  </div>
                  <i className="fas fa-times-circle text-3xl opacity-90"></i>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-white to-orange-50 rounded-3xl shadow-2xl border border-orange-100/50 overflow-hidden">
              <div className="p-8 bg-gradient-to-r from-orange-500 to-red-500 border-b border-orange-200">
                <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                  <i className="fas fa-clipboard-list"></i>
                  Detail Monitoring Stok
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-orange-100 to-red-100">
                      <th className="p-6 border-b border-orange-200 text-orange-800 font-bold text-left text-lg">Kode Barang</th>
                      <th className="p-6 border-b border-orange-200 text-orange-800 font-bold text-left text-lg">Nama Barang</th>
                      <th className="p-6 border-b border-orange-200 text-orange-800 font-bold text-center text-lg">Stok Saat Ini</th>
                      <th className="p-6 border-b border-orange-200 text-orange-800 font-bold text-right text-lg">Harga Beli</th>
                      <th className="p-6 border-b border-orange-200 text-orange-800 font-bold text-right text-lg">Harga Jual</th>
                      <th className="p-6 border-b border-orange-200 text-orange-800 font-bold text-right text-lg">Nilai Stok</th>
                      <th className="p-6 border-b border-orange-200 text-orange-800 font-bold text-center text-lg">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stokBarang.map((item) => {
                      const nilaiStok = item.harga_jual * item.qty || 0;
                      const isLowStock = item.qty < 10;
                      const isOutOfStock = item.qty === 0;
                      
                      return (
                        <tr key={item.id} className="hover:bg-orange-50/50 transition-colors duration-200 border-b border-orange-100">
                          <td className="p-6 font-mono bg-orange-50 text-orange-700 rounded-xl font-bold border border-orange-200">
                            {item.kode_barang}
                          </td>
                          <td className="p-6 font-bold text-slate-800">{item.nama_barang}</td>
                          <td className={`p-6 text-center font-bold text-2xl ${
                            isOutOfStock ? 'text-red-600' : isLowStock ? 'text-orange-500' : 'text-green-600'
                          }`}>
                            {item.qty}
                          </td>
                          <td className="p-6 text-right text-slate-600 font-semibold">
                            Rp {item.harga_beli?.toLocaleString() || '0'}
                          </td>
                          <td className="p-6 text-right text-slate-600 font-semibold">
                            Rp {item.harga_jual?.toLocaleString() || '0'}
                          </td>
                          <td className="p-6 font-bold text-blue-600 text-right text-lg">
                            Rp {nilaiStok.toLocaleString()}
                          </td>
                          <td className="p-6 text-center">
                            <span className={`px-4 py-2 rounded-full text-sm font-bold ${
                              isOutOfStock ? 'bg-red-100 text-red-800 border border-red-200' :
                              isLowStock ? 'bg-orange-100 text-orange-800 border border-orange-200' :
                              'bg-green-100 text-green-800 border border-green-200'
                            }`}>
                              {isOutOfStock ? '🔄 Habis' : isLowStock ? '⚠️ Rendah' : '✅ Normal'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Ringkasan Laporan Stok */}
            <div className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border-2 border-blue-200/50 rounded-3xl p-8 backdrop-blur-sm">
              <h3 className="text-2xl font-bold text-blue-800 mb-6 flex items-center gap-3">
                <i className="fas fa-chart-pie"></i>
                📊 Ringkasan Analisis Stok
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-lg">
                <div className="space-y-4">
                  <p className="flex justify-between items-center">
                    <strong className="text-blue-700">Total Nilai Investasi Stok:</strong>
                    <span className="font-bold text-green-600">Rp {stokBarang.reduce((sum, item) => sum + (item.harga_beli * item.qty || 0), 0).toLocaleString()}</span>
                  </p>
                  <p className="flex justify-between items-center">
                    <strong className="text-blue-700">Total Potensi Penjualan:</strong>
                    <span className="font-bold text-purple-600">Rp {stokBarang.reduce((sum, item) => sum + (item.harga_jual * item.qty || 0), 0).toLocaleString()}</span>
                  </p>
                </div>
                <div className="space-y-4">
                  <p className="flex justify-between items-center">
                    <strong className="text-blue-700">Estimasi Keuntungan:</strong>
                    <span className="font-bold text-green-600">Rp {stokBarang.reduce((sum, item) => sum + ((item.harga_jual - item.harga_beli) * item.qty || 0), 0).toLocaleString()}</span>
                  </p>
                  <p className="flex justify-between items-center">
                    <strong className="text-blue-700">Barang Perlu Restock:</strong>
                    <span className="font-bold text-orange-600">{stokBarang.filter(item => item.qty < 10).length} item</span>
                  </p>
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
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
        <div className="bg-white p-12 rounded-3xl shadow-2xl text-center transform hover:scale-105 transition-all duration-300">
          <div className="animate-spin rounded-full h-20 w-20 border-b-4 border-indigo-600 mx-auto mb-6"></div>
          <p className="text-2xl font-bold text-gray-800 mb-2">Memuat Dashboard...</p>
          <p className="text-gray-600">Menyiapkan data untuk Anda</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-lg shadow-xl border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-6">
              <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-4 rounded-3xl shadow-2xl transform hover:rotate-12 transition-all duration-300">
                <i className="fas fa-store text-white text-3xl"></i>
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  Dashboard Kepala Toko
                </h1>
                <p className="text-slate-600 text-lg mt-2 flex items-center gap-2">
                  <i className="fas fa-user text-indigo-500"></i>
                  Login sebagai: <span className="font-bold text-indigo-600">{user?.email}</span>
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white px-8 py-4 rounded-2xl font-bold text-lg shadow-2xl hover:shadow-3xl transition-all duration-300 flex items-center space-x-3 transform hover:-translate-y-1"
            >
              <i className="fas fa-sign-out-alt text-xl"></i>
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl border border-slate-200/50 p-3 mb-10">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <button
              className={`px-8 py-6 rounded-2xl font-bold text-lg transition-all duration-300 flex items-center justify-center space-x-4 transform hover:-translate-y-1 ${
                activeView === "pembelian" 
                  ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-2xl" 
                  : "text-slate-600 hover:bg-blue-50 hover:text-blue-600 hover:shadow-lg border-2 border-transparent hover:border-blue-200"
              }`}
              onClick={() => setActiveView("pembelian")}
            >
              <i className={`fas fa-shopping-cart text-2xl ${activeView === "pembelian" ? "text-white" : "text-blue-500"}`}></i>
              <span>Input Pembelian</span>
            </button>
            <button
              className={`px-8 py-6 rounded-2xl font-bold text-lg transition-all duration-300 flex items-center justify-center space-x-4 transform hover:-translate-y-1 ${
                activeView === "laporan-pembelian" 
                  ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-2xl" 
                  : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 hover:shadow-lg border-2 border-transparent hover:border-indigo-200"
              }`}
              onClick={() => setActiveView("laporan-pembelian")}
            >
              <i className={`fas fa-chart-bar text-2xl ${activeView === "laporan-pembelian" ? "text-white" : "text-indigo-500"}`}></i>
              <span>Laporan Pembelian</span>
            </button>
            <button
              className={`px-8 py-6 rounded-2xl font-bold text-lg transition-all duration-300 flex items-center justify-center space-x-4 transform hover:-translate-y-1 ${
                activeView === "service" 
                  ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-2xl" 
                  : "text-slate-600 hover:bg-purple-50 hover:text-purple-600 hover:shadow-lg border-2 border-transparent hover:border-purple-200"
              }`}
              onClick={() => setActiveView("service")}
            >
              <i className={`fas fa-tools text-2xl ${activeView === "service" ? "text-white" : "text-purple-500"}`}></i>
              <span>Laporan Service</span>
            </button>
            <button
              className={`px-8 py-6 rounded-2xl font-bold text-lg transition-all duration-300 flex items-center justify-center space-x-4 transform hover:-translate-y-1 ${
                activeView === "penjualan" 
                  ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-2xl" 
                  : "text-slate-600 hover:bg-green-50 hover:text-green-600 hover:shadow-lg border-2 border-transparent hover:border-green-200"
              }`}
              onClick={() => setActiveView("penjualan")}
            >
              <i className={`fas fa-chart-line text-2xl ${activeView === "penjualan" ? "text-white" : "text-green-500"}`}></i>
              <span>Laporan Penjualan</span>
            </button>
            <button
              className={`px-8 py-6 rounded-2xl font-bold text-lg transition-all duration-300 flex items-center justify-center space-x-4 transform hover:-translate-y-1 ${
                activeView === "stok" 
                  ? "bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-2xl" 
                  : "text-slate-600 hover:bg-orange-50 hover:text-orange-600 hover:shadow-lg border-2 border-transparent hover:border-orange-200"
              }`}
              onClick={() => setActiveView("stok")}
            >
              <i className={`fas fa-boxes text-2xl ${activeView === "stok" ? "text-white" : "text-orange-500"}`}></i>
              <span>Monitoring Stok</span>
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl border border-slate-200/50 p-10">
          {renderContent()}
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gradient-to-r from-slate-800 to-slate-900 text-white py-12 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="bg-white/10 p-3 rounded-2xl">
              <i className="fas fa-store text-2xl text-white"></i>
            </div>
            <p className="text-slate-300 text-lg">
              &copy; {new Date().getFullYear()} Goku Komunika | Dibuat oleh <span className="text-white font-bold">Raya Rizkyana</span>. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}