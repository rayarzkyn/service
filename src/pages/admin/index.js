import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { auth, db } from '../../firebase/config';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
  writeBatch,
  increment,
  where
} from 'firebase/firestore';

export default function AdminDashboard() {
  // State management
  const [user, setUser] = useState(null);
  const [stokBarang, setStokBarang] = useState([]);
  const [penjualan, setPenjualan] = useState([]);
  const [dataBarang, setDataBarang] = useState([]);
  const [newBarang, setNewBarang] = useState({ 
    kode_barang: '',
    nama_barang: '',
    qty: 0,
    terpakai: 0,
    harga_beli: 0,
    harga_jual: 0 
  });
  const [newPenjualan, setNewPenjualan] = useState({
    namaPembeli: '',
    items: [],
    totalHarga: 0,
    pembayaran: 0,
    kembalian: 0,
    tanggal: new Date()
  });
  const [editing, setEditing] = useState(null);
  const [sortOrder, setSortOrder] = useState('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('stok');
  const [isMobile, setIsMobile] = useState(false);
  const [bulkAddMode, setBulkAddMode] = useState(false);
  const [bulkData, setBulkData] = useState('');
  const [searchPenjualan, setSearchPenjualan] = useState('');
  
  const router = useRouter();

  // Filter untuk pencarian di input penjualan
  const filteredBarangPenjualan = stokBarang
    .filter(item => 
      item.nama_barang.toLowerCase().includes(searchPenjualan.toLowerCase()) ||
      item.kode_barang.toLowerCase().includes(searchPenjualan.toLowerCase())
    )
    .sort((a, b) => a.nama_barang.localeCompare(b.nama_barang));

  const filteredStokBarang = stokBarang
    .filter(item => 
      item.nama_barang.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.kode_barang.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => a.nama_barang.localeCompare(b.nama_barang));

  // Cek ukuran layar
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Cek auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) router.push('/');
      else {
        setUser(currentUser);
        fetchData();
      }
    });
    return () => unsubscribe();
  }, []);

  // Ambil data
  const fetchData = async () => {
    try {
      const [stokSnapshot, penjualanSnapshot, barangSnapshot] = await Promise.all([
        getDocs(collection(db, 'stok')),
        getDocs(query(collection(db, 'penjualan'), orderBy('tanggal', 'desc'))),
        getDocs(query(collection(db, 'barang'), orderBy('tanggal', 'desc')))
      ]);

      const sortedStok = stokSnapshot.docs
        .map(doc => ({
          id: doc.id, 
          ...doc.data(),
          sisa: (doc.data().qty || 0) - (doc.data().terpakai || 0),
          keuntungan: (doc.data().harga_jual || 0) - (doc.data().harga_beli || 0)
        }))
        .sort((a, b) => a.nama_barang.localeCompare(b.nama_barang));
      
      setStokBarang(sortedStok);

      setPenjualan(penjualanSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        formattedDate: doc.data().tanggal?.toDate?.().toLocaleString('id-ID') || '-'
      })));

      setDataBarang(barangSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })));

    } catch (error) {
      console.error("Error fetching data:", error);
      setStokBarang([]);
      setPenjualan([]);
      setDataBarang([]);
    }
  };

  // Fungsi untuk input penjualan
  const handleAddPenjualanItem = () => {
    setNewPenjualan({
      ...newPenjualan,
      items: [...newPenjualan.items, { 
        kode_barang: '', 
        nama_barang: '', 
        qty: 1, 
        harga: 0, 
        subtotal: 0 
      }]
    });
  };

  const handleUpdatePenjualanItem = (index, field, value) => {
    const updatedItems = [...newPenjualan.items];
    
    if (field === 'nama_barang') {
      const selectedProduct = stokBarang.find(item => item.nama_barang === value);
      if (selectedProduct) {
        updatedItems[index] = {
          ...updatedItems[index],
          kode_barang: selectedProduct.kode_barang,
          nama_barang: value,
          harga: selectedProduct.harga_jual,
          subtotal: selectedProduct.harga_jual * updatedItems[index].qty
        };
      }
    } else if (field === 'qty') {
      const qty = Math.max(1, Number(value));
      updatedItems[index] = {
        ...updatedItems[index],
        qty: qty,
        subtotal: qty * updatedItems[index].harga
      };
    }

    const totalHarga = updatedItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    
    setNewPenjualan({
      ...newPenjualan,
      items: updatedItems,
      totalHarga: totalHarga
    });
  };

  const handleRemovePenjualanItem = (index) => {
    const updatedItems = newPenjualan.items.filter((_, i) => i !== index);
    const totalHarga = updatedItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    
    setNewPenjualan({
      ...newPenjualan,
      items: updatedItems,
      totalHarga: totalHarga
    });
  };

  // PERBAIKAN: Fungsi untuk menghitung kembalian
  const calculateKembalian = (pembayaran, totalHarga) => {
    return Math.max(0, pembayaran - totalHarga);
  };

  // PERBAIKAN: Update pembayaran untuk penjualan
  const handlePembayaranPenjualanChange = (pembayaran) => {
    const kembalian = calculateKembalian(pembayaran, newPenjualan.totalHarga);
    
    setNewPenjualan({
      ...newPenjualan,
      pembayaran: pembayaran,
      kembalian: kembalian
    });
  };

  const handleSubmitPenjualan = async () => {
    if (!newPenjualan.namaPembeli || newPenjualan.items.length === 0) {
      alert('Nama pembeli dan minimal 1 barang harus diisi!');
      return;
    }

    if (newPenjualan.pembayaran < newPenjualan.totalHarga) {
      alert('Pembayaran tidak mencukupi!');
      return;
    }

    for (const item of newPenjualan.items) {
      const product = stokBarang.find(p => p.nama_barang === item.nama_barang);
      if (!product) {
        alert(`Barang ${item.nama_barang} tidak ditemukan!`);
        return;
      }
      if (product.qty - product.terpakai < item.qty) {
        alert(`Stok ${item.nama_barang} tidak mencukupi! Tersedia: ${product.qty - product.terpakai}`);
        return;
      }
    }

    try {
      const updatePromises = newPenjualan.items.map(async (item) => {
        const product = stokBarang.find(p => p.nama_barang === item.nama_barang);
        if (product) {
          const productRef = doc(db, 'stok', product.id);
          await updateDoc(productRef, {
            qty: increment(-item.qty),
            terpakai: increment(item.qty)
          });
        }
      });

      await Promise.all(updatePromises);

      await addDoc(collection(db, 'penjualan'), {
        ...newPenjualan,
        tanggal: serverTimestamp(),
        userId: user.uid
      });

      setNewPenjualan({
        namaPembeli: '',
        items: [],
        totalHarga: 0,
        pembayaran: 0,
        kembalian: 0,
        tanggal: new Date()
      });
      setSearchPenjualan('');

      alert('Penjualan berhasil dicatat!');
      fetchData();
    } catch (error) {
      console.error("Error submitting penjualan:", error);
      alert(`Gagal mencatat penjualan: ${error.message}`);
    }
  };

  const handleCetakNota = (penjualanData) => {
    setTimeout(() => {
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html>
          <head>
            <title>Nota Penjualan</title>
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
              .nota { background: white; border-radius: 16px; padding: 30px; max-width: 400px; margin: 0 auto; box-shadow: 0 20px 40px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
              .header { text-align: center; margin-bottom: 25px; padding-bottom: 20px; border-bottom: 2px solid #e2e8f0; }
              .items-table { width: 100%; border-collapse: collapse; margin: 25px 0; }
              .items-table th, .items-table td { border-bottom: 1px solid #e2e8f0; padding: 12px 8px; text-align: left; }
              .total { border-top: 2px solid #000; padding-top: 15px; text-align: right; font-weight: bold; }
              .footer { text-align: center; margin-top: 25px; padding-top: 20px; border-top: 2px solid #e2e8f0; color: #64748b; }
              .payment-info { background: #f8fafc; padding: 20px; margin: 20px 0; border-radius: 12px; border-left: 4px solid #3b82f6; }
              @media print { 
                body { margin: 0; background: white; } 
                .nota { border: none; box-shadow: none; border-radius: 0; }
              }
            </style>
          </head>
          <body>
            <div class="nota">
              <div class="header">
                <h2 style="color: #1e40af; margin: 0 0 10px 0; font-size: 24px;">GOKU KOMUNIKA</h2>
                <p style="color: #64748b; margin: 5px 0; font-size: 12px;">Jl. Parakan Muncang, Sindang Kasih, Kec. Cimanggung, Kab. Sumedang</p>
                <p style="color: #64748b; margin: 5px 0; font-size: 12px;">WhatsApp: 0851-3633-6006</p>
              </div>
              
              <div style="border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 15px 0; margin: 15px 0;">
                <p style="font-weight: bold; color: #1e293b; margin: 5px 0;">Nota Penjualan</p>
                <p style="color: #64748b; margin: 3px 0; font-size: 12px;">Tanggal: ${penjualanData.formattedDate}</p>
                <p style="color: #64748b; margin: 3px 0; font-size: 12px;">Pembeli: ${penjualanData.namaPembeli}</p>
              </div>

              <table class="items-table">
                <thead>
                  <tr>
                    <th style="color: #64748b; font-weight: 600;">Barang</th>
                    <th style="color: #64748b; font-weight: 600;">Qty</th>
                    <th style="color: #64748b; font-weight: 600;">Harga</th>
                    <th style="color: #64748b; font-weight: 600;">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${penjualanData.items?.map(item => `
                    <tr>
                      <td style="color: #374151;">${item.nama_barang}</td>
                      <td style="color: #374151;">${item.qty}</td>
                      <td style="color: #374151;">Rp ${item.harga?.toLocaleString()}</td>
                      <td style="color: #374151;">Rp ${item.subtotal?.toLocaleString()}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>

              <div class="payment-info">
                <p style="font-weight: bold; color: #1e40af; margin: 0 0 10px 0;">Total: Rp ${penjualanData.totalHarga?.toLocaleString()}</p>
                <p style="color: #374151; margin: 5px 0;">Pembayaran: Rp ${penjualanData.pembayaran?.toLocaleString()}</p>
                <p style="color: #374151; margin: 5px 0;">Kembalian: Rp ${penjualanData.kembalian?.toLocaleString()}</p>
              </div>

              <div class="footer">
                <p style="margin: 5px 0;">Terima kasih atas kunjungan Anda</p>
              </div>
            </div>
            <script>
              window.onload = function() {
                window.print();
                setTimeout(() => window.close(), 1000);
              }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }, 500);
  };

  // Fungsi untuk stok barang
  const handleAddBarang = async () => {
    if (!newBarang.kode_barang || !newBarang.nama_barang || newBarang.qty < 0) {
      alert('Kode barang, nama barang dan stok harus diisi!');
      return;
    }
    
    try {
      await addDoc(collection(db, 'stok'), {
        ...newBarang,
        kode_barang: newBarang.kode_barang.trim(),
        nama_barang: newBarang.nama_barang.trim(),
        qty: Number(newBarang.qty),
        terpakai: Number(newBarang.terpakai),
        harga_beli: Number(newBarang.harga_beli),
        harga_jual: Number(newBarang.harga_jual),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      });
      setNewBarang({ 
        kode_barang: '',
        nama_barang: '',
        qty: 0,
        terpakai: 0,
        harga_beli: 0,
        harga_jual: 0 
      });
      fetchData();
    } catch (error) {
      console.error("Error adding item:", error);
      alert(`Gagal menambahkan barang: ${error.message}`);
    }
  };

  const handleUpdateBarang = async () => {
    try {
      await updateDoc(doc(db, 'stok', editing.id), {
        kode_barang: editing.kode_barang.trim(),
        nama_barang: editing.nama_barang.trim(),
        qty: Number(editing.qty),
        terpakai: Number(editing.terpakai),
        harga_beli: Number(editing.harga_beli),
        harga_jual: Number(editing.harga_jual),
        updated_at: serverTimestamp()
      });
      setEditing(null);
      fetchData();
    } catch (error) {
      console.error("Error updating item:", error);
      alert(`Gagal mengupdate barang: ${error.message}`);
    }
  };

  const handleDeleteBarang = async (id) => {
    if (confirm('Hapus barang ini?')) {
      try {
        await deleteDoc(doc(db, 'stok', id));
        fetchData();
      } catch (error) {
        console.error("Error deleting item:", error);
      }
    }
  };

  // Bulk add functionality
  const handleBulkAdd = async () => {
    const lines = bulkData.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) {
      alert("Format tidak valid. Minimal harus ada header dan 1 data");
      return;
    }

    const headers = lines[0].split('\t');
    const requiredHeaders = ['Kode Barang', 'Nama Barang', 'Qty', 'Harga Beli', 'Harga Jual'];
    
    if (!requiredHeaders.every(h => headers.includes(h))) {
      alert(`Header harus mengandung: ${requiredHeaders.join(', ')}`);
      return;
    }

    const items = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split('\t');
      if (values.length !== headers.length) continue;

      const item = {};
      headers.forEach((header, index) => {
        item[header.toLowerCase().replace(' ', '_')] = values[index].trim();
      });

      items.push({
        kode_barang: item.kode_barang,
        nama_barang: item.nama_barang,
        qty: Number(item.qty) || 0,
        terpakai: 0,
        harga_beli: Number(item.harga_beli) || 0,
        harga_jual: Number(item.harga_jual) || 0,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      });
    }

    if (items.length === 0) {
      alert("Tidak ada data yang valid untuk dimasukkan");
      return;
    }

    try {
      const batch = writeBatch(db);
      items.forEach(item => {
        const docRef = doc(collection(db, 'stok'));
        batch.set(docRef, item);
      });

      await batch.commit();
      alert(`${items.length} barang berhasil ditambahkan`);
      setBulkData('');
      setBulkAddMode(false);
      fetchData();
    } catch (error) {
      console.error("Error bulk adding items:", error);
      alert(`Gagal menambahkan barang: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 p-4 md:p-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 rounded-2xl p-6 mb-8 shadow-2xl shadow-blue-500/20">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="text-white">
            <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-white to-blue-100 bg-clip-text text-transparent">
              Dashboard Admin
            </h1>
            <p className="text-blue-100 text-lg">
              Selamat datang, <span className="font-semibold text-white">{user?.email}</span>
              <span className="ml-3 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full text-sm font-medium">
                👨‍💼 Admin
              </span>
            </p>
          </div>
          <button 
            onClick={() => signOut(auth)} 
            className="bg-white/20 backdrop-blur-sm text-white px-6 py-3 rounded-xl font-semibold hover:bg-white/30 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 border border-white/30"
          >
            <i className="fas fa-sign-out-alt mr-2"></i>Logout
          </button>
        </div>
      </div>

      {/* Tab Navigasi */}
      <div className="bg-white rounded-2xl p-2 mb-8 shadow-xl border border-slate-100 flex overflow-x-auto">
        <button
          className={`px-6 py-4 font-semibold rounded-xl whitespace-nowrap transition-all duration-300 flex items-center gap-3 ${
            activeTab === 'stok'
              ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
              : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'
          }`}
          onClick={() => setActiveTab('stok')}
        >
          <div className={`p-2 rounded-lg ${
            activeTab === 'stok' ? 'bg-white/20' : 'bg-blue-100'
          }`}>
            <i className="fas fa-boxes text-lg"></i>
          </div>
          <span>Manajemen Stok</span>
        </button>

        <button
          className={`px-6 py-4 font-semibold rounded-xl whitespace-nowrap transition-all duration-300 flex items-center gap-3 ${
            activeTab === 'penjualan'
              ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-lg'
              : 'text-slate-600 hover:text-emerald-600 hover:bg-emerald-50'
          }`}
          onClick={() => setActiveTab('penjualan')}
        >
          <div className={`p-2 rounded-lg ${
            activeTab === 'penjualan' ? 'bg-white/20' : 'bg-emerald-100'
          }`}>
            <i className="fas fa-cash-register text-lg"></i>
          </div>
          <span>Input Penjualan</span>
        </button>

        <button
          className={`px-6 py-4 font-semibold rounded-xl whitespace-nowrap transition-all duration-300 flex items-center gap-3 ${
            activeTab === 'riwayat-penjualan'
              ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg'
              : 'text-slate-600 hover:text-orange-600 hover:bg-orange-50'
          }`}
          onClick={() => setActiveTab('riwayat-penjualan')}
        >
          <div className={`p-2 rounded-lg ${
            activeTab === 'riwayat-penjualan' ? 'bg-white/20' : 'bg-orange-100'
          }`}>
            <i className="fas fa-history text-lg"></i>
          </div>
          <span>Riwayat Penjualan</span>
        </button>
      </div>

      {/* Konten berdasarkan Tab */}
      {activeTab === 'stok' && (
        <>
          {/* Form Input Stok */}
          <section className="mb-8 p-8 bg-white rounded-2xl shadow-xl border border-slate-100">
            <div className="flex items-center mb-8">
              <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-3 rounded-2xl shadow-lg mr-4">
                <i className="fas fa-plus-circle text-white text-2xl"></i>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-800">
                  {editing ? 'Edit Barang' : 
                   bulkAddMode ? 'Tambah Barang Massal' : 'Tambah Barang'}
                </h2>
                <p className="text-slate-600">
                  {editing ? 'Edit data barang yang ada' : 
                   bulkAddMode ? 'Tambah banyak barang sekaligus' : 'Tambah barang baru ke inventory'}
                </p>
              </div>
            </div>

            {bulkAddMode ? (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold mb-3 text-slate-700">
                    Format Data (Copy dari Excel/Spreadsheet):
                  </label>
                  <textarea
                    value={bulkData}
                    onChange={(e) => setBulkData(e.target.value)}
                    className="w-full p-4 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 bg-slate-50 hover:bg-white font-mono text-sm resize-none"
                    rows={8}
                    
                  />
                  <p className="text-sm text-slate-500 mt-2">
                    📋 Copy data dari Excel/Spreadsheet dengan format tab-delimited
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleBulkAdd}
                    className="bg-gradient-to-r from-emerald-500 to-green-500 text-white px-6 py-3 rounded-xl font-semibold hover:shadow-lg transition-all duration-300 hover:scale-105 flex items-center gap-2"
                  >
                    <i className="fas fa-database"></i>
                    <span>Tambah Massal</span>
                  </button>
                  <button
                    onClick={() => {
                      setBulkAddMode(false);
                      setBulkData('');
                    }}
                    className="bg-gradient-to-r from-slate-500 to-gray-500 text-white px-6 py-3 rounded-xl font-semibold hover:shadow-lg transition-all duration-300 hover:scale-105 flex items-center gap-2"
                  >
                    <i className="fas fa-times"></i>
                    <span>Batal</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-semibold mb-3 text-slate-700">Kode Barang*</label>
                    <input
                      type="text"
                      value={editing ? editing.kode_barang : newBarang.kode_barang}
                      onChange={(e) => 
                        editing 
                          ? setEditing({...editing, kode_barang: e.target.value}) 
                          : setNewBarang({...newBarang, kode_barang: e.target.value})
                      }
                      className="w-full p-4 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 bg-slate-50 hover:bg-white"
                      
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-3 text-slate-700">Nama Barang*</label>
                    <input
                      type="text"
                      value={editing ? editing.nama_barang : newBarang.nama_barang}
                      onChange={(e) => 
                        editing 
                          ? setEditing({...editing, nama_barang: e.target.value}) 
                          : setNewBarang({...newBarang, nama_barang: e.target.value})
                      }
                      className="w-full p-4 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 bg-slate-50 hover:bg-white"
                      
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-3 text-slate-700">Qty*</label>
                    <input
                      type="number"
                      value={editing ? editing.qty : newBarang.qty}
                      onChange={(e) => 
                        editing 
                          ? setEditing({...editing, qty: e.target.value}) 
                          : setNewBarang({...newBarang, qty: e.target.value})
                      }
                      className="w-full p-4 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 bg-slate-50 hover:bg-white"
                      min="0"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-3 text-slate-700">Harga Beli (Rp)*</label>
                    <input
                      type="number"
                      value={editing ? editing.harga_beli : newBarang.harga_beli}
                      onChange={(e) => 
                        editing 
                          ? setEditing({...editing, harga_beli: e.target.value}) 
                          : setNewBarang({...newBarang, harga_beli: e.target.value})
                      }
                      className="w-full p-4 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 bg-slate-50 hover:bg-white"
                      min="0"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-3 text-slate-700">Harga Jual (Rp)*</label>
                    <input
                      type="number"
                      value={editing ? editing.harga_jual : newBarang.harga_jual}
                      onChange={(e) => 
                        editing 
                          ? setEditing({...editing, harga_jual: e.target.value}) 
                          : setNewBarang({...newBarang, harga_jual: e.target.value})
                      }
                      className="w-full p-4 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 bg-slate-50 hover:bg-white"
                      min="0"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-3 text-slate-700">Terpakai</label>
                    <input
                      type="number"
                      value={editing ? editing.terpakai : newBarang.terpakai}
                      onChange={(e) => 
                        editing 
                          ? setEditing({...editing, terpakai: e.target.value}) 
                          : setNewBarang({...newBarang, terpakai: e.target.value})
                      }
                      className="w-full p-4 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 bg-slate-50 hover:bg-white"
                      min="0"
                    />
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  {editing ? (
                    <>
                      <button
                        onClick={handleUpdateBarang}
                        className="bg-gradient-to-r from-emerald-500 to-green-500 text-white px-6 py-3 rounded-xl font-semibold hover:shadow-lg transition-all duration-300 hover:scale-105 flex items-center gap-2"
                      >
                        <i className="fas fa-save"></i>
                        <span>Simpan Perubahan</span>
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="bg-gradient-to-r from-slate-500 to-gray-500 text-white px-6 py-3 rounded-xl font-semibold hover:shadow-lg transition-all duration-300 hover:scale-105 flex items-center gap-2"
                      >
                        <i className="fas fa-times"></i>
                        <span>Batal</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleAddBarang}
                        className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-6 py-3 rounded-xl font-semibold hover:shadow-lg transition-all duration-300 hover:scale-105 flex items-center gap-2"
                      >
                        <i className="fas fa-plus"></i>
                        <span>Tambah Barang</span>
                      </button>
                      <button
                        onClick={() => setBulkAddMode(true)}
                        className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-3 rounded-xl font-semibold hover:shadow-lg transition-all duration-300 hover:scale-105 flex items-center gap-2"
                      >
                        <i className="fas fa-layer-group"></i>
                        <span>Tambah Banyak</span>
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </section>

          {/* Daftar Stok Barang */}
          <section className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
            <div className="p-6 bg-gradient-to-r from-slate-50 to-blue-50 border-b border-slate-200">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 flex items-center">
                    <i className="fas fa-boxes-stacked text-blue-500 mr-3"></i>
                    Daftar Stok Barang
                  </h2>
                  <p className="text-slate-600 mt-1">
                    Total {filteredStokBarang.length} barang ditemukan
                  </p>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                  <div className="relative flex-1 md:w-80">
                    <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"></i>
                    <input
                      type="text"
                      placeholder="🔍 Cari barang..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-slate-50 to-blue-50">
                    <th className="p-4 border-b border-slate-200 text-center text-slate-700 font-bold">No</th>
                    <th className="p-4 border-b border-slate-200 text-slate-700 font-bold">Kode Barang</th>
                    <th className="p-4 border-b border-slate-200 text-slate-700 font-bold">Nama Barang</th>
                    <th className="p-4 border-b border-slate-200 text-center text-slate-700 font-bold">Qty</th>
                    <th className="p-4 border-b border-slate-200 text-center text-slate-700 font-bold">Terpakai</th>
                    <th className="p-4 border-b border-slate-200 text-center text-slate-700 font-bold">Sisa</th>
                    <th className="p-4 border-b border-slate-200 text-center text-slate-700 font-bold">Harga Beli</th>
                    <th className="p-4 border-b border-slate-200 text-center text-slate-700 font-bold">Harga Jual</th>
                    <th className="p-4 border-b border-slate-200 text-center text-slate-700 font-bold">Keuntungan</th>
                    <th className="p-4 border-b border-slate-200 text-center text-slate-700 font-bold">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStokBarang.length > 0 ? (
                    filteredStokBarang.map((item, index) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors duration-200">
                        <td className="p-4 border-b border-slate-200 text-center font-semibold text-slate-700">{index + 1}</td>
                        <td className="p-4 border-b border-slate-200">
                          <span className="inline-block bg-gradient-to-r from-purple-500 to-pink-500 text-white px-3 py-2 rounded-xl text-sm font-bold font-mono shadow-lg">
                            {item.kode_barang}
                          </span>
                        </td>
                        <td className="p-4 border-b border-slate-200 font-semibold text-slate-800">{item.nama_barang}</td>
                        <td className="p-4 border-b border-slate-200 text-center font-bold text-blue-600">{item.qty}</td>
                        <td className="p-4 border-b border-slate-200 text-center font-semibold text-orange-600">{item.terpakai}</td>
                        <td className="p-4 border-b border-slate-200 text-center font-bold text-emerald-600">{item.qty - item.terpakai}</td>
                        <td className="p-4 border-b border-slate-200 text-center font-semibold text-slate-700">
                          Rp {item.harga_beli?.toLocaleString('id-ID') || '0'}
                        </td>
                        <td className="p-4 border-b border-slate-200 text-center font-semibold text-slate-700">
                          Rp {item.harga_jual?.toLocaleString('id-ID') || '0'}
                        </td>
                        <td className={`p-4 border-b border-slate-200 text-center font-bold ${
                          (item.harga_jual - item.harga_beli) >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          Rp {(item.harga_jual - item.harga_beli)?.toLocaleString('id-ID') || '0'}
                        </td>
                        <td className="p-4 border-b border-slate-200 text-center">
                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={() =>
                                setEditing({
                                  id: item.id,
                                  kode_barang: item.kode_barang,
                                  nama_barang: item.nama_barang,
                                  qty: item.qty,
                                  terpakai: item.terpakai,
                                  harga_beli: item.harga_beli,
                                  harga_jual: item.harga_jual
                                })
                              }
                              className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:shadow-lg transition-all duration-300 hover:scale-105 flex items-center gap-2"
                            >
                              <i className="fas fa-edit"></i>
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => handleDeleteBarang(item.id)}
                              className="bg-gradient-to-r from-rose-500 to-pink-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:shadow-lg transition-all duration-300 hover:scale-105 flex items-center gap-2"
                            >
                              <i className="fas fa-trash"></i>
                              <span>Hapus</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="p-12 text-center">
                        <div className="bg-gradient-to-r from-slate-100 to-blue-100 p-8 rounded-2xl inline-block mb-4">
                          <i className="fas fa-inbox text-6xl text-slate-400"></i>
                        </div>
                        <h3 className="text-xl font-bold text-slate-700 mb-2">
                          {searchTerm ? 'Barang tidak ditemukan' : 'Belum ada data stok barang'}
                        </h3>
                        <p className="text-slate-500">
                          {searchTerm ? 'Coba dengan kata kunci lain' : 'Mulai dengan menambahkan barang baru'}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* TAB Input Penjualan */}
      {activeTab === 'penjualan' && (
        <section className="mb-8 p-8 bg-white rounded-2xl shadow-xl border border-slate-100">
          <div className="flex items-center mb-8">
            <div className="bg-gradient-to-r from-emerald-500 to-green-500 p-3 rounded-2xl shadow-lg mr-4">
              <i className="fas fa-cash-register text-white text-2xl"></i>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Input Penjualan Barang</h2>
              <p className="text-slate-600">Catat transaksi penjualan barang</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <label className="block text-sm font-semibold mb-3 text-slate-700">Nama Pembeli*</label>
              <input
                type="text"
                value={newPenjualan.namaPembeli}
                onChange={(e) => setNewPenjualan({...newPenjualan, namaPembeli: e.target.value})}
                className="w-full p-4 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-300 bg-slate-50 hover:bg-white"
                placeholder="Masukkan nama pembeli"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-3 text-slate-700">Tanggal</label>
              <input
                type="date"
                value={newPenjualan.tanggal.toISOString().split('T')[0]}
                onChange={(e) => setNewPenjualan({...newPenjualan, tanggal: new Date(e.target.value)})}
                className="w-full p-4 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-300 bg-slate-50 hover:bg-white"
              />
            </div>
          </div>

          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center">
              <i className="fas fa-shopping-basket text-emerald-500 mr-3"></i>
              Barang yang Dijual
            </h3>
            
            <div className="mb-6">
              <label className="block text-sm font-semibold mb-3 text-slate-700">
                <i className="fas fa-search text-emerald-500 mr-2"></i>Cari Barang
              </label>
              <input
                type="text"
                placeholder="🔍 Cari barang berdasarkan nama atau kode..."
                value={searchPenjualan}
                onChange={(e) => setSearchPenjualan(e.target.value)}
                className="w-full p-4 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-300 bg-slate-50 hover:bg-white"
              />
              {searchPenjualan && (
                <p className="text-sm text-emerald-600 mt-2 font-medium">
                  Menampilkan {filteredBarangPenjualan.length} barang ditemukan
                </p>
              )}
            </div>
            
            {newPenjualan.items.map((item, index) => (
              <div key={index} className="flex gap-3 items-center p-4 bg-emerald-50 rounded-xl border-2 border-emerald-200 mb-3 hover:border-emerald-300 transition-all duration-300">
                <select
                  value={item.nama_barang}
                  onChange={(e) => handleUpdatePenjualanItem(index, 'nama_barang', e.target.value)}
                  className="flex-1 p-3 border-2 border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-300 bg-white"
                >
                  <option value="">📦 Pilih Barang</option>
                  {filteredBarangPenjualan.map(product => (
                    <option key={product.id} value={product.nama_barang}>
                      {product.nama_barang} 
                      {product.kode_barang && ` (${product.kode_barang})`} 
                      - Stok: {product.qty - product.terpakai} 
                      - Rp {product.harga_jual?.toLocaleString()}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={item.qty}
                  onChange={(e) => handleUpdatePenjualanItem(index, 'qty', e.target.value)}
                  className="w-24 p-3 border-2 border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-300 bg-white text-center"
                  min="1"
                />
                <span className="w-32 p-3 text-sm font-semibold text-slate-700 bg-white rounded-xl border-2 border-slate-200 text-center">
                  Rp {item.harga?.toLocaleString()}
                </span>
                <span className="w-32 p-3 text-sm font-bold text-emerald-600 bg-white rounded-xl border-2 border-slate-200 text-center">
                  Rp {item.subtotal?.toLocaleString()}
                </span>
                <button
                  onClick={() => handleRemovePenjualanItem(index)}
                  className="text-rose-500 hover:text-rose-700 p-3 hover:bg-rose-50 rounded-xl transition-all duration-300"
                >
                  <i className="fas fa-times text-lg"></i>
                </button>
              </div>
            ))}

            <button
              onClick={handleAddPenjualanItem}
              className="text-emerald-600 font-semibold text-sm flex items-center gap-3 mt-4 p-4 hover:bg-emerald-50 rounded-xl transition-all duration-300 border-2 border-dashed border-emerald-200 hover:border-emerald-400"
            >
              <i className="fas fa-plus-circle text-emerald-500"></i> 
              <span>Tambah Barang</span>
            </button>
          </div>

          {/* Input pembayaran untuk penjualan */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="flex justify-between items-center p-6 bg-gradient-to-r from-emerald-50 to-green-50 rounded-2xl border-2 border-emerald-200">
              <span className="text-lg font-bold text-slate-800">Total Harga:</span>
              <span className="text-2xl font-bold text-emerald-600">
                Rp {newPenjualan.totalHarga.toLocaleString()}
              </span>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-3 text-slate-700">Pembayaran (Rp)</label>
              <input
                type="number"
                value={newPenjualan.pembayaran}
                onChange={(e) => handlePembayaranPenjualanChange(Math.max(0, Number(e.target.value)))}
                className="w-full p-4 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all duration-300 bg-slate-50 hover:bg-white"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-3 text-slate-700">Kembalian (Rp)</label>
              <input
                type="number"
                value={newPenjualan.kembalian}
                readOnly
                className="w-full p-4 border-2 border-slate-200 rounded-xl bg-slate-100 text-slate-700 font-semibold"
              />
            </div>
          </div>

          <button 
            onClick={handleSubmitPenjualan}
            className="w-full bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 flex items-center justify-center gap-3"
          >
            <i className="fas fa-save"></i> 
            <span>Simpan Penjualan</span>
          </button>
        </section>
      )}

      {/* TAB Riwayat Penjualan */}
      {activeTab === 'riwayat-penjualan' && (
        <section className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
          <div className="p-8 bg-gradient-to-r from-orange-500 to-amber-500">
            <h2 className="text-2xl font-bold text-white flex items-center">
              <i className="fas fa-history mr-4 text-white"></i>Riwayat Penjualan
            </h2>
            <p className="text-orange-100 mt-2">Lihat semua transaksi penjualan yang telah dicatat</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gradient-to-r from-orange-50 to-amber-50">
                  <th className="p-4 border-b border-orange-200 text-center text-orange-800 font-bold">No</th>
                  <th className="p-4 border-b border-orange-200 text-orange-800 font-bold">Tanggal</th>
                  <th className="p-4 border-b border-orange-200 text-orange-800 font-bold">Pembeli</th>
                  <th className="p-4 border-b border-orange-200 text-orange-800 font-bold">Barang</th>
                  <th className="p-4 border-b border-orange-200 text-center text-orange-800 font-bold">Total</th>
                  <th className="p-4 border-b border-orange-200 text-center text-orange-800 font-bold">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {penjualan.length > 0 ? (
                  penjualan.map((item, index) => (
                    <tr key={item.id} className="hover:bg-orange-50 transition-colors duration-200">
                      <td className="p-4 border-b border-orange-100 text-center font-semibold text-slate-700">{index + 1}</td>
                      <td className="p-4 border-b border-orange-100 font-semibold text-slate-800">{item.formattedDate}</td>
                      <td className="p-4 border-b border-orange-100 font-semibold text-slate-800">{item.namaPembeli}</td>
                      <td className="p-4 border-b border-orange-100">
                        <div className="text-sm text-slate-600">
                          {item.items?.slice(0, 2).map(i => i.nama_barang).join(', ')}
                          {item.items?.length > 2 && ` dan ${item.items.length - 2} barang lainnya`}
                        </div>
                      </td>
                      <td className="p-4 border-b border-orange-100 text-center font-bold text-emerald-600">
                        Rp {item.totalHarga?.toLocaleString()}
                      </td>
                      <td className="p-4 border-b border-orange-100 text-center">
                        <button
                          onClick={() => handleCetakNota(item)}
                          className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:shadow-lg transition-all duration-300 hover:scale-105 flex items-center gap-2"
                        >
                          <i className="fas fa-print"></i>
                          <span>Cetak Nota</span>
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-12 text-center">
                      <div className="bg-gradient-to-r from-orange-100 to-amber-100 p-8 rounded-2xl inline-block mb-4">
                        <i className="fas fa-inbox text-6xl text-orange-400"></i>
                      </div>
                      <h3 className="text-xl font-bold text-slate-700 mb-2">Belum ada data penjualan</h3>
                      <p className="text-slate-500">Mulai dengan mencatat penjualan baru</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}