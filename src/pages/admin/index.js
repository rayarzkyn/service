import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { auth, db } from '../../firebase/config';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import DeleteAllStockButton from "@/components/admin/DeleteAllStockButton";
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
  const [services, setServices] = useState([]);
  const [stokBarang, setStokBarang] = useState([]);
  const [penjualan, setPenjualan] = useState([]);
  const [pembelian, setPembelian] = useState([]);
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
  const [newPembelian, setNewPembelian] = useState({
    namaSupplier: '',
    items: [],
    totalHarga: 0,
    pembayaran: 0,
    kembalian: 0,
    tanggal: new Date()
  });
  const [editing, setEditing] = useState(null);
  const [editingService, setEditingService] = useState(null);
  const [sortOrder, setSortOrder] = useState('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [newService, setNewService] = useState({
    namaPelanggan: '',
    merkHP: '',
    kerusakan: '',
    biaya: 0,
    status: 'Menunggu Konfirmasi',
    sparepartsUsed: [],
    pembayaran: 0,
    kembalian: 0
  });
  const [activeTab, setActiveTab] = useState('service');
  const [isMobile, setIsMobile] = useState(false);
  const [searchSparepart, setSearchSparepart] = useState('');
  const [bulkAddMode, setBulkAddMode] = useState(false);
  const [bulkData, setBulkData] = useState('');
  const [selectedNota, setSelectedNota] = useState(null);
  const [searchPenjualan, setSearchPenjualan] = useState('');
  const [searchPembelian, setSearchPembelian] = useState('');
  const [searchBarangPembelian, setSearchBarangPembelian] = useState('');
  
  // STATE BARU: Untuk service yang dikelompokkan per hari
  const [servicesGroupedByDate, setServicesGroupedByDate] = useState([]);
  
  // STATE BARU: Untuk role badge
  const [activeRole, setActiveRole] = useState('teknisi'); // 'admin' atau 'teknisi'
  
  const router = useRouter();

  // FUNGSI BARU: Handle menu click dengan role detection
  const handleMenuClick = (menuType) => {
    setActiveTab(menuType);
    
    // Set role berdasarkan menu yang dipilih
    if (['stok', 'pembelian', 'penjualan', 'riwayat-penjualan', 'riwayat-pembelian'].includes(menuType)) {
      setActiveRole('admin');
    } else if (['service'].includes(menuType)) {
      setActiveRole('teknisi');
    }
  };

  // FUNGSI BARU: Generate ID Service
  const generateServiceId = async () => {
    const today = new Date();
    const dateString = today.toISOString().slice(2, 10).replace(/-/g, '');
    
    // Cari service dengan tanggal hari ini
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const servicesTodaySnapshot = await getDocs(
      query(
        collection(db, 'service'),
        where('tanggalMasuk', '>=', todayStart),
        where('tanggalMasuk', '<=', todayEnd)
      )
    );

    const sequenceNumber = (servicesTodaySnapshot.size + 1).toString().padStart(3, '0');
    
    return `SRV${dateString}${sequenceNumber}`;
  };

  // FUNGSI BARU: Mengelompokkan service berdasarkan tanggal dan menghitung laba
  const groupServicesByDate = (servicesData) => {
    const grouped = {};
    
    servicesData.forEach(service => {
      const date = service.tanggalMasuk?.toDate?.().toLocaleDateString('id-ID') || 'Tanggal Tidak Diketahui';
      
      if (!grouped[date]) {
        grouped[date] = {
          date,
          services: [],
          totalBiaya: 0,
          totalLaba: 0,
          totalPendapatan: 0
        };
      }
      
      // PERBAIKAN: Hitung biaya sparepart (harga jual)
      const biayaSparepart = service.sparepartsUsed?.reduce((sum, item) => {
        const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
        return sum + ((sparepart?.harga_jual || 0) * item.qty);
      }, 0) || 0;
      
      // PERBAIKAN: Total pendapatan adalah biaya service + biaya sparepart (harga jual)
      const totalPendapatan = (service.biaya || 0) + biayaSparepart;
      
      // PERBAIKAN: Hitung laba = (biaya service + biaya sparepart harga jual) - (biaya sparepart harga beli)
      const biayaSparepartHargaBeli = service.sparepartsUsed?.reduce((sum, item) => {
        const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
        return sum + ((sparepart?.harga_beli || 0) * item.qty);
      }, 0) || 0;
      
      const totalLaba = totalPendapatan - biayaSparepartHargaBeli;
      
      grouped[date].services.push({
        ...service,
        biayaSparepart, // Harga jual sparepart
        biayaSparepartHargaBeli, // Harga beli sparepart
        totalPendapatan,
        totalLaba
      });
      
      grouped[date].totalBiaya += service.biaya || 0;
      grouped[date].totalLaba += totalLaba;
      grouped[date].totalPendapatan += totalPendapatan;
    });
    
    // Konversi ke array dan urutkan berdasarkan tanggal (terbaru dulu)
    return Object.values(grouped).sort((a, b) => 
      new Date(b.services[0]?.tanggalMasuk?.toDate?.() || 0) - 
      new Date(a.services[0]?.tanggalMasuk?.toDate?.() || 0)
    );
  };

  // PERBAIKAN: Fungsi untuk menghitung total biaya service (termasuk sparepart)
  const calculateTotalBiayaService = () => {
    const biayaService = newService.biaya || 0;
    const biayaSparepart = newService.sparepartsUsed?.reduce((total, item) => {
      const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
      if (sparepart) {
        return total + (sparepart.harga_jual * item.qty);
      }
      return total;
    }, 0) || 0;
    
    return biayaService + biayaSparepart;
  };

  // PERBAIKAN: Fungsi untuk menghitung kembalian
  const calculateKembalian = (pembayaran, totalHarga) => {
    return Math.max(0, pembayaran - totalHarga);
  };

  // PERBAIKAN: Update pembayaran untuk service
  const handlePembayaranServiceChange = (pembayaran) => {
    const totalBiaya = calculateTotalBiayaService();
    const kembalian = calculateKembalian(pembayaran, totalBiaya);
    
    setNewService({
      ...newService,
      pembayaran: pembayaran,
      kembalian: kembalian
    });
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

  // PERBAIKAN: Update pembayaran untuk pembelian
  const handlePembayaranPembelianChange = (pembayaran) => {
    const kembalian = calculateKembalian(pembayaran, newPembelian.totalHarga);
    
    setNewPembelian({
      ...newPembelian,
      pembayaran: pembayaran,
      kembalian: kembalian
    });
  };

  const handleUpdateBiaya = async (id, biayaBaru) => {
    try {
      const serviceRef = doc(db, "service", id);
      await updateDoc(serviceRef, { biaya: Number(biayaBaru) });
      setServices(prev =>
        prev.map(service =>
          service.id === id ? { ...service, biaya: Number(biayaBaru) } : service
        )
      );
      console.log("Biaya berhasil diperbarui:", biayaBaru);
    } catch (error) {
      console.error("Gagal update biaya:", error);
    }
  };

  // Filter sparepart berdasarkan pencarian
  const filteredSpareparts = stokBarang
    .filter(item => item.nama_barang.toLowerCase().includes(searchSparepart.toLowerCase()))
    .sort((a, b) => a.nama_barang.localeCompare(b.nama_barang));

  const filteredStokBarang = stokBarang
    .filter(item => 
      item.nama_barang.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.kode_barang.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => a.nama_barang.localeCompare(b.nama_barang));

  // Filter untuk pencarian di input penjualan
  const filteredBarangPenjualan = stokBarang
    .filter(item => 
      item.nama_barang.toLowerCase().includes(searchPenjualan.toLowerCase()) ||
      item.kode_barang.toLowerCase().includes(searchPenjualan.toLowerCase())
    )
    .sort((a, b) => a.nama_barang.localeCompare(b.nama_barang));

  // PERBAIKAN: Filter untuk pencarian barang di form pembelian - GUNAKAN stokBarang
  const filteredBarangPembelian = stokBarang
    .filter(item => 
      item.nama_barang.toLowerCase().includes(searchBarangPembelian.toLowerCase()) ||
      item.kode_barang.toLowerCase().includes(searchBarangPembelian.toLowerCase())
    )
    .sort((a, b) => a.nama_barang.localeCompare(b.nama_barang));

  // Filter untuk pencarian di riwayat pembelian
  const filteredPembelian = pembelian
    .filter(item => 
      item.namaSupplier?.toLowerCase().includes(searchPembelian.toLowerCase()) ||
      item.items?.some(i => i.nama_barang?.toLowerCase().includes(searchPembelian.toLowerCase()))
    )
    .sort((a, b) => new Date(b.tanggal?.toDate?.()) - new Date(a.tanggal?.toDate?.()));

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
      const [serviceSnapshot, stokSnapshot, penjualanSnapshot, pembelianSnapshot, barangSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'service'), orderBy('tanggalMasuk', 'desc'))),
        getDocs(collection(db, 'stok')),
        getDocs(query(collection(db, 'penjualan'), orderBy('tanggal', 'desc'))),
        getDocs(query(collection(db, 'pembelian'), orderBy('tanggal', 'desc'))),
        getDocs(query(collection(db, 'barang'), orderBy('tanggal', 'desc')))
      ]);

      const servicesData = serviceSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        sparepartsUsed: doc.data().sparepartsUsed || [],
        formattedDate: doc.data().tanggalMasuk?.toDate?.().toLocaleString('id-ID') || '-'
      }));

      setServices(servicesData);

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

      setPembelian(pembelianSnapshot.docs.map(doc => ({
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
      setServices([]);
      setStokBarang([]);
      setPenjualan([]);
      setPembelian([]);
      setDataBarang([]);
    }
  };

  // EFFECT BARU: Update servicesGroupedByDate ketika services atau stokBarang berubah
  useEffect(() => {
    if (services.length > 0 && stokBarang.length > 0) {
      const groupedServices = groupServicesByDate(services);
      setServicesGroupedByDate(groupedServices);
    }
  }, [services, stokBarang]);

  // ========== FUNGSI BARU: PEMBELIAN BARANG ==========
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

  // PERBAIKAN: Fungsi handleUpdatePembelianItem
  const handleUpdatePembelianItem = (index, field, value) => {
    const updatedItems = [...newPembelian.items];
    
    if (field === 'nama_barang') {
      // Cari barang dari stokBarang (sama seperti di penjualan)
      const selectedProduct = stokBarang.find(item => item.nama_barang === value);
      if (selectedProduct) {
        updatedItems[index] = {
          ...updatedItems[index],
          kode_barang: selectedProduct.kode_barang,
          nama_barang: selectedProduct.nama_barang,
          harga_beli: selectedProduct.harga_beli || 0,
          subtotal: selectedProduct.harga_beli || 0
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

  const handleSubmitPembelian = async () => {
    if (!newPembelian.namaSupplier || newPembelian.items.length === 0) {
      alert('Nama supplier dan minimal 1 barang harus diisi!');
      return;
    }

    if (newPembelian.pembayaran < newPembelian.totalHarga) {
      alert('Pembayaran tidak mencukupi!');
      return;
    }

    try {
      // 1. Update atau tambah stok barang
      const updateStockPromises = newPembelian.items.map(async (item) => {
        const existingProduct = stokBarang.find(p => p.nama_barang === item.nama_barang);
        
        if (existingProduct) {
          // Update stok yang sudah ada
          const productRef = doc(db, 'stok', existingProduct.id);
          await updateDoc(productRef, {
            qty: increment(item.qty),
            harga_beli: item.harga_beli,
            harga_jual: item.harga_beli * 1.3,
            updated_at: serverTimestamp()
          });
        } else {
          // Tambah barang baru
          await addDoc(collection(db, 'stok'), {
            kode_barang: item.kode_barang,
            nama_barang: item.nama_barang,
            qty: Number(item.qty),
            terpakai: 0,
            harga_beli: Number(item.harga_beli),
            harga_jual: Number(item.harga_beli) * 1.3,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
          });
        }
      });

      await Promise.all(updateStockPromises);

      // 2. Simpan transaksi pembelian
      await addDoc(collection(db, 'pembelian'), {
        ...newPembelian,
        tanggal: serverTimestamp(),
        userId: user.uid
      });

      // 3. Reset form
      setNewPembelian({
        namaSupplier: '',
        items: [],
        totalHarga: 0,
        pembayaran: 0,
        kembalian: 0,
        tanggal: new Date()
      });
      setSearchBarangPembelian('');

      alert('Pembelian berhasil dicatat dan stok diperbarui!');
      fetchData();
    } catch (error) {
      console.error("Error submitting pembelian:", error);
      alert(`Gagal mencatat pembelian: ${error.message}`);
    }
  };

  // ========== FUNGSI BARU: CETAK NOTA PEMBELIAN ==========
  const handleCetakNotaPembelian = (pembelianData) => {
    setTimeout(() => {
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html>
          <head>
            <title>Nota Pembelian</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .nota { border: 2px solid #000; padding: 20px; max-width: 400px; margin: 0 auto; }
              .header { text-align: center; margin-bottom: 20px; }
              .items-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
              .items-table th, .items-table td { border-bottom: 1px solid #ddd; padding: 8px; text-align: left; }
              .total { border-top: 2px solid #000; padding-top: 10px; text-align: right; font-weight: bold; }
              .footer { text-align: center; margin-top: 20px; }
              .payment-info { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 5px; }
              @media print { body { margin: 0; } .nota { border: none; } }
            </style>
          </head>
          <body>
            <div class="nota">
              <div class="header">
                <h2>GOKU KOMUNIKA</h2>
                <p>Alamat: Jl. Parakan Muncang, Sindang Kasih, Kec. Cimanggung, Kab. Sumedang</p>
                <p>Telp: WhatsApp: 0851-3633-6006</p>
              </div>
              
              <div style="border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 10px 0; margin: 10px 0;">
                <p><strong>Nota Pembelian</strong></p>
                <p>Tanggal: ${pembelianData.formattedDate}</p>
                <p>Supplier: ${pembelianData.namaSupplier}</p>
              </div>

              <table class="items-table">
                <thead>
                  <tr>
                    <th>Barang</th>
                    <th>Qty</th>
                    <th>Harga Beli</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${pembelianData.items?.map(item => `
                    <tr>
                      <td>${item.nama_barang}</td>
                      <td>${item.qty}</td>
                      <td>Rp ${item.harga_beli?.toLocaleString()}</td>
                      <td>Rp ${item.subtotal?.toLocaleString()}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>

              <div class="payment-info">
                <p><strong>Total: Rp ${pembelianData.totalHarga?.toLocaleString()}</strong></p>
                <p>Pembayaran: Rp ${pembelianData.pembayaran?.toLocaleString()}</p>
                <p>Kembalian: Rp ${pembelianData.kembalian?.toLocaleString()}</p>
              </div>

              <div class="footer">
                <p>Terima kasih</p>
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

  // Fungsi untuk input penjualan (tetap sama)
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
    setSelectedNota(penjualanData);
    
    setTimeout(() => {
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html>
          <head>
            <title>Nota Penjualan</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .nota { border: 2px solid #000; padding: 20px; max-width: 400px; margin: 0 auto; }
              .header { text-align: center; margin-bottom: 20px; }
              .items-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
              .items-table th, .items-table td { border-bottom: 1px solid #ddd; padding: 8px; text-align: left; }
              .total { border-top: 2px solid #000; padding-top: 10px; text-align: right; font-weight: bold; }
              .footer { text-align: center; margin-top: 20px; }
              .payment-info { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 5px; }
              @media print { body { margin: 0; } .nota { border: none; } }
            </style>
          </head>
          <body>
            <div class="nota">
              <div class="header">
                <h2>GOKU KOMUNIKA</h2>
                <p>Alamat: Jl. Parakan Muncang, Sindang Kasih, Kec. Cimanggung, Kab. Sumedang</p>
                <p>Telp: WhatsApp: 0851-3633-6006</p>
              </div>
              
              <div style="border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 10px 0; margin: 10px 0;">
                <p><strong>Nota Penjualan</strong></p>
                <p>Tanggal: ${penjualanData.formattedDate}</p>
                <p>Pembeli: ${penjualanData.namaPembeli}</p>
              </div>

              <table class="items-table">
                <thead>
                  <tr>
                    <th>Barang</th>
                    <th>Qty</th>
                    <th>Harga</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${penjualanData.items?.map(item => `
                    <tr>
                      <td>${item.nama_barang}</td>
                      <td>${item.qty}</td>
                      <td>Rp ${item.harga?.toLocaleString()}</td>
                      <td>Rp ${item.subtotal?.toLocaleString()}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>

              <div class="payment-info">
                <p><strong>Total: Rp ${penjualanData.totalHarga?.toLocaleString()}</strong></p>
                <p>Pembayaran: Rp ${penjualanData.pembayaran?.toLocaleString()}</p>
                <p>Kembalian: Rp ${penjualanData.kembalian?.toLocaleString()}</p>
              </div>

              <div class="footer">
                <p>Terima kasih atas kunjungan Anda</p>
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

  // PERBAIKAN: Fungsi cetak nota untuk service
  const handleCetakNotaService = (serviceData) => {
    const totalBiaya = (serviceData.biaya || 0) + (serviceData.biayaSparepart || 0);
    
    setTimeout(() => {
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html>
          <head>
            <title>Nota Service</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .nota { border: 2px solid #000; padding: 20px; max-width: 400px; margin: 0 auto; }
              .header { text-align: center; margin-bottom: 20px; }
              .items-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
              .items-table th, .items-table td { border-bottom: 1px solid #ddd; padding: 8px; text-align: left; }
              .total { border-top: 2px solid #000; padding-top: 10px; text-align: right; font-weight: bold; }
              .footer { text-align: center; margin-top: 20px; }
              .payment-info { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 5px; }
              .customer-info { background: #e8f4fd; padding: 10px; margin: 10px 0; border-radius: 5px; }
              @media print { body { margin: 0; } .nota { border: none; } }
            </style>
          </head>
          <body>
            <div class="nota">
              <div class="header">
                <h2>GOKU KOMUNIKA</h2>
                <p>Alamat: Jl. Parakan Muncang, Sindang Kasih, Kec. Cimanggung, Kab. Sumedang</p>
                <p>Telp: WhatsApp: 0851-3633-6006</p>
              </div>
              
              <div style="border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 10px 0; margin: 10px 0;">
                <p><strong>Nota Service HP</strong></p>
                <p>Tanggal: ${serviceData.formattedDate}</p>
                <p>ID Service: ${serviceData.serviceId}</p>
              </div>

              <div class="customer-info">
                <p><strong>Data Pelanggan:</strong></p>
                <p>Nama: ${serviceData.namaPelanggan}</p>
                <p>Merk HP: ${serviceData.merkHP}</p>
                <p>Kerusakan: ${serviceData.kerusakan || '-'}</p>
              </div>

              <table class="items-table">
                <thead>
                  <tr>
                    <th>Deskripsi</th>
                    <th>Biaya</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Biaya Service</td>
                    <td>Rp ${(serviceData.biaya || 0).toLocaleString()}</td>
                  </tr>
                  ${serviceData.sparepartsUsed?.map(item => {
                    const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
                    const harga = sparepart?.harga_jual || 0;
                    const subtotal = harga * item.qty;
                    return `
                      <tr>
                        <td>${item.nama} (x${item.qty})</td>
                        <td>Rp ${subtotal.toLocaleString()}</td>
                      </tr>
                    `;
                  }).join('') || ''}
                </tbody>
              </table>

              <div class="payment-info">
                <p><strong>Total Biaya: Rp ${totalBiaya.toLocaleString()}</strong></p>
                <p>Pembayaran: Rp ${(serviceData.pembayaran || 0).toLocaleString()}</p>
                <p>Kembalian: Rp ${(serviceData.kembalian || 0).toLocaleString()}</p>
              </div>

              <div class="footer">
                <p>Simpan ID Service untuk pengecekan status</p>
                <p>Terima kasih atas kepercayaan Anda</p>
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

  // Fungsi-fungsi lainnya tetap sama (deleteAllStock, updateStok, handleAddService, dll.)
  const deleteAllStock = async () => {
    if (!confirm("Yakin ingin menghapus semua barang?")) return;

    try {
      const snapshot = await getDocs(collection(db, "stok"));
      const deletePromises = snapshot.docs.map((d) =>
        deleteDoc(doc(db, "stok", d.id))
      );
      await Promise.all(deletePromises);

      alert("Semua barang berhasil dihapus");
      fetchData();
    } catch (error) {
      console.error("Error deleting stock:", error);
      alert("Gagal menghapus barang");
    }
  };

  const updateStok = async (spareparts, operation = 'decrement') => {
    const multiplier = operation === 'decrement' ? -1 : 1;
    
    try {
      const promises = spareparts.map(async (item) => {
        const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
        if (!sparepart) return;

        const sparepartRef = doc(db, 'stok', sparepart.id);
        await updateDoc(sparepartRef, {
          qty: increment(multiplier * Number(item.qty)),
          terpakai: increment(-multiplier * Number(item.qty))
        });
      });

      await Promise.all(promises);
      return true;
    } catch (error) {
      console.error("Error updating stock:", error);
      return false;
    }
  };

  // PERBAIKAN: Tambah service baru dengan ID Service dan pembayaran
  const handleAddService = async () => {
    if (!newService.namaPelanggan || !newService.merkHP) {
      alert('Nama Pelanggan dan Merk HP wajib diisi!');
      return;
    }

    const totalBiaya = calculateTotalBiayaService();
    if (newService.pembayaran < totalBiaya) {
      alert('Pembayaran tidak mencukupi!');
      return;
    }

    const validSpareparts = newService.sparepartsUsed
      .filter(item => item.nama && item.qty > 0)
      .map(item => ({
        nama: item.nama,
        qty: Number(item.qty)
      }));

    for (const item of validSpareparts) {
      const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
      if (!sparepart) {
        alert(`Sparepart ${item.nama} tidak ditemukan!`);
        return;
      }
      if ((sparepart.qty - sparepart.terpakai) < item.qty) {
        alert(`Stok ${item.nama} tidak mencukupi! Tersedia: ${sparepart.qty - sparepart.terpakai}`);
        return;
      }
    }

    try {
      const stockUpdated = await updateStok(validSpareparts, 'decrement');
      if (!stockUpdated) throw new Error("Gagal update stok");

      // PERBAIKAN: Hitung biaya sparepart menggunakan harga jual
      const sparepartsCost = validSpareparts.reduce((sum, item) => {
        const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
        return sum + (sparepart?.harga_jual || 0) * item.qty;
      }, 0);

      // Generate ID Service
      const serviceId = await generateServiceId();

      await addDoc(collection(db, 'service'), {
        ...newService,
        serviceId: serviceId, // ID Service yang unik
        biaya: Number(newService.biaya), // Biaya service saja (tanpa tambahan sparepart)
        sparepartsUsed: validSpareparts,
        pembayaran: Number(newService.pembayaran),
        kembalian: Number(newService.kembalian),
        tanggalMasuk: serverTimestamp(),
        userId: user.uid
      });

      setNewService({
        namaPelanggan: '',
        merkHP: '',
        kerusakan: '',
        biaya: 0,
        status: 'Menunggu Konfirmasi',
        sparepartsUsed: [],
        pembayaran: 0,
        kembalian: 0
      });
      setSearchSparepart('');
      fetchData();
      
      // Tampilkan ID Service kepada admin
      alert(`Service berhasil ditambahkan!\nID Service: ${serviceId}\n\nBerikan ID ini kepada pelanggan untuk melacak status service.`);
    } catch (error) {
      console.error("Error adding service:", error);
      alert(`Gagal menambahkan service: ${error.message}`);
    }
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

  const handleEditSpareparts = async () => {
    if (!editingService) return;

    const oldService = services.find(s => s.id === editingService.id);
    if (!oldService) {
      alert('Service tidak ditemukan!');
      return;
    }

    const newSpareparts = editingService.sparepartsUsed
      .filter(item => item.nama && item.qty > 0)
      .map(item => ({
        nama: item.nama,
        nama_barang: item.nama,
        qty: Number(item.qty)
      }));

    for (const item of newSpareparts) {
      const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
      if (!sparepart) {
        alert(`Sparepart "${item.nama}" tidak ditemukan!`);
        return;
      }

      const oldItem = oldService.sparepartsUsed.find(sp => sp.nama === item.nama);
      const oldQty = oldItem ? oldItem.qty : 0;
      const stokTersedia = sparepart.qty + oldQty - item.qty;

      if (stokTersedia < 0) {
        alert(`Stok "${item.nama}" tidak mencukupi! Tersedia: ${sparepart.qty}, Dibutuhkan: ${item.qty}, Stok akan menjadi: ${stokTersedia}`);
        return;
      }
    }

    try {
      const returnPromises = oldService.sparepartsUsed.map(async (item) => {
        const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
        if (!sparepart) return;
        
        const sparepartRef = doc(db, 'stok', sparepart.id);
        await updateDoc(sparepartRef, {
          qty: increment(Number(item.qty)),
          terpakai: increment(-Number(item.qty))
        });
      });

      await Promise.all(returnPromises);

      const deductPromises = newSpareparts.map(async (item) => {
        const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
        if (!sparepart) return;
        
        const sparepartRef = doc(db, 'stok', sparepart.id);
        await updateDoc(sparepartRef, {
          qty: increment(-Number(item.qty)),
          terpakai: increment(Number(item.qty))
        });
      });

      await Promise.all(deductPromises);

      await updateDoc(doc(db, 'service', editingService.id), {
        sparepartsUsed: newSpareparts,
        tanggalUpdate: serverTimestamp()
      });

      setEditingService(null);
      setSearchSparepart('');
      fetchData();
      alert('Perubahan sparepart berhasil disimpan!');
      
    } catch (error) {
      console.error("Error updating spareparts:", error);
      alert(`Gagal update sparepart: ${error.message}`);
    }
  };

  const handleDeleteService = async (id) => {
    if (!confirm('Hapus service ini? Stok sparepart akan dikembalikan.')) return;
    
    try {
      const service = services.find(s => s.id === id);
      if (!service) return;

      if (service.sparepartsUsed?.length > 0) {
        await updateStok(service.sparepartsUsed, 'increment');
      }

      await deleteDoc(doc(db, 'service', id));
      fetchData();
    } catch (error) {
      console.error("Error deleting service:", error);
      alert(`Gagal menghapus service: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-4 md:p-6">
      {/* Header dengan Role Badge */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-4 mb-6 shadow-lg">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {activeRole === 'admin' ? '🏪 Dashboard Admin' : '🔧 Dashboard Teknisi'}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-blue-100">Login sebagai: {user?.email}</p>
              <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                activeRole === 'admin' 
                  ? 'bg-yellow-100 text-yellow-800' 
                  : 'bg-green-100 text-green-800'
              }`}>
                {activeRole === 'admin' ? 'ADMIN' : 'TEKNISI'}
              </span>
            </div>
          </div>
          <button 
            onClick={() => signOut(auth)} 
            className="bg-white text-blue-600 px-4 py-2 rounded-lg font-medium hover:bg-blue-50 transition-all shadow-md w-full md:w-auto"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Tab Navigasi dengan Badge Role */}
      <div className="bg-white rounded-xl p-1 mb-6 shadow-md flex overflow-x-auto">
        <button
          className={`px-4 py-3 font-medium rounded-lg whitespace-nowrap transition-all text-sm flex items-center gap-2 ${
            activeTab === 'service'
              ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow'
              : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
          }`}
          onClick={() => handleMenuClick('service')}
        >
          <i className="fas fa-tools"></i> Service
          <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">TEKNISI</span>
        </button>

        <button
          className={`px-4 py-3 font-medium rounded-lg whitespace-nowrap transition-all text-sm flex items-center gap-2 ${
            activeTab === 'pembelian'
              ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow'
              : 'text-gray-500 hover:text-indigo-600 hover:bg-indigo-50'
          }`}
          onClick={() => handleMenuClick('pembelian')}
        >
          <i className="fas fa-shopping-cart"></i> Input Pembelian
          <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">ADMIN</span>
        </button>

        <button
          className={`px-4 py-3 font-medium rounded-lg whitespace-nowrap transition-all text-sm flex items-center gap-2 ${
            activeTab === 'penjualan'
              ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow'
              : 'text-gray-500 hover:text-green-600 hover:bg-green-50'
          }`}
          onClick={() => handleMenuClick('penjualan')}
        >
          <i className="fas fa-cash-register"></i> Input Penjualan
          <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">ADMIN</span>
        </button>

        <button
          className={`px-4 py-3 font-medium rounded-lg whitespace-nowrap transition-all text-sm flex items-center gap-2 ${
            activeTab === 'stok'
              ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow'
              : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
          }`}
          onClick={() => handleMenuClick('stok')}
        >
          <i className="fas fa-boxes"></i> Manajemen Stok
          <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">ADMIN</span>
        </button>

        <button
          className={`px-4 py-3 font-medium rounded-lg whitespace-nowrap transition-all text-sm flex items-center gap-2 ${
            activeTab === 'riwayat-penjualan'
              ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow'
              : 'text-gray-500 hover:text-orange-600 hover:bg-orange-50'
          }`}
          onClick={() => handleMenuClick('riwayat-penjualan')}
        >
          <i className="fas fa-history"></i> Riwayat Penjualan
          <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">ADMIN</span>
        </button>

        <button
          className={`px-4 py-3 font-medium rounded-lg whitespace-nowrap transition-all text-sm flex items-center gap-2 ${
            activeTab === 'riwayat-pembelian'
              ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow'
              : 'text-gray-500 hover:text-purple-600 hover:bg-purple-50'
          }`}
          onClick={() => handleMenuClick('riwayat-pembelian')}
        >
          <i className="fas fa-file-invoice"></i> Riwayat Pembelian
          <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">ADMIN</span>
        </button>
      </div>

      {/* Konten berdasarkan Tab - TIDAK ADA PERUBAHAN */}
      {activeTab === 'service' && (
        <>
          {/* Form Tambah Service */}
          <section className="mb-6 p-6 bg-gradient-to-br from-white to-blue-50 rounded-xl shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-blue-800 flex items-center">
              <i className="fas fa-plus-circle mr-2"></i>Tambah Servis Baru
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium mb-1 text-blue-700">Nama Pelanggan*</label>
                <input
                  type="text"
                  value={newService.namaPelanggan}
                  onChange={(e) => setNewService({...newService, namaPelanggan: e.target.value})}
                  className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-blue-700">Merk HP*</label>
                <input
                  type="text"
                  value={newService.merkHP}
                  onChange={(e) => setNewService({...newService, merkHP: e.target.value})}
                  className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1 text-blue-700">Kerusakan</label>
                <textarea
                  value={newService.kerusakan}
                  onChange={(e) => setNewService({...newService, kerusakan: e.target.value})}
                  className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-blue-700">Biaya Service (Rp)</label>
                <input
                  type="number"
                  value={newService.biaya}
                  onChange={(e) => setNewService({
                    ...newService, 
                    biaya: Math.max(0, Number(e.target.value))
                  })}
                  className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-blue-700">Status</label>
                <select
                  value={newService.status}
                  onChange={(e) => setNewService({...newService, status: e.target.value})}
                  className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                >
                  <option value="Menunggu Konfirmasi">Menunggu</option>
                  <option value="Dalam Proses">Proses</option>
                  <option value="Sudah Selesai">Selesai</option>
                  <option value="Batal">Batal</option>
                </select>
              </div>
              
              {/* PERBAIKAN: Input Pembayaran untuk Service */}
              <div>
                <label className="block text-sm font-medium mb-1 text-blue-700">Pembayaran (Rp)</label>
                <input
                  type="number"
                  value={newService.pembayaran}
                  onChange={(e) => handlePembayaranServiceChange(Math.max(0, Number(e.target.value)))}
                  className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-blue-700">Kembalian (Rp)</label>
                <input
                  type="number"
                  value={newService.kembalian}
                  readOnly
                  className="w-full p-3 border border-blue-200 rounded-lg bg-gray-100 text-gray-700"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1 text-blue-700">Sparepart Digunakan</label>
                
                <div className="mb-3">
                  <input
                    type="text"
                    placeholder="Cari sparepart..."
                    value={searchSparepart}
                    onChange={(e) => setSearchSparepart(e.target.value)}
                    className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                </div>

                <div className="space-y-3">
                  {newService.sparepartsUsed.map((item, index) => (
                    <div key={index} className="flex gap-2 items-center p-3 bg-blue-50 rounded-lg">
                      <select
                        value={item.nama}
                        onChange={(e) => {
                          const updated = [...newService.sparepartsUsed];
                          updated[index].nama = e.target.value;
                          setNewService({...newService, sparepartsUsed: updated});
                        }}
                        className="flex-1 p-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      >
                        <option value="">Pilih Sparepart</option>
                        {filteredSpareparts.map(sp => (
                          <option key={sp.id} value={sp.nama_barang}>
                            {sp.nama_barang} (Stok: {sp.qty - sp.terpakai}, Harga: Rp {sp.harga_jual?.toLocaleString('id-ID')})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={item.qty}
                        onChange={(e) => {
                          const updated = [...newService.sparepartsUsed];
                          updated[index].qty = Math.max(1, Number(e.target.value));
                          setNewService({...newService, sparepartsUsed: updated});
                        }}
                        className="w-20 p-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                        min="1"
                      />
                      <button
                        onClick={() => {
                          setNewService({
                            ...newService,
                            sparepartsUsed: newService.sparepartsUsed.filter((_, i) => i !== index)
                          });
                        }}
                        className="text-red-500 px-2 hover:text-red-700 transition-colors"
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      setNewService({
                        ...newService,
                        sparepartsUsed: [...newService.sparepartsUsed, { nama: '', qty: 1 }]
                      });
                    }}
                    className="text-blue-600 font-medium text-sm flex items-center gap-2 mt-2 p-2 hover:bg-blue-100 rounded-lg transition-all"
                  >
                    <i className="fas fa-plus-circle"></i> Tambah Sparepart
                  </button>
                </div>
              </div>

              {/* PERBAIKAN: Total Biaya Service */}
              <div className="md:col-span-2">
                <div className="bg-blue-100 p-4 rounded-lg border border-blue-200">
                  <h3 className="font-semibold text-blue-800 mb-2">Rincian Biaya:</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>Biaya Service:</div>
                    <div className="text-right">Rp {newService.biaya?.toLocaleString() || '0'}</div>
                    <div>Biaya Sparepart:</div>
                    <div className="text-right">Rp {newService.sparepartsUsed?.reduce((total, item) => {
                      const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
                      return total + ((sparepart?.harga_jual || 0) * item.qty);
                    }, 0)?.toLocaleString() || '0'}</div>
                    <div className="font-semibold">Total Biaya:</div>
                    <div className="text-right font-semibold text-green-600">
                      Rp {calculateTotalBiayaService().toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <button 
              onClick={handleAddService}
              className="mt-4 bg-gradient-to-r from-green-500 to-teal-500 text-white px-6 py-3 rounded-lg font-medium hover:from-green-600 hover:to-teal-600 transition-all shadow-md hover:shadow-lg flex items-center"
            >
              <i className="fas fa-save mr-2"></i> Tambah Servis
            </button>
          </section>

          {/* TAB BARU: Tabel Service yang Dikelompokkan per Hari */}
          <section className="mb-10 bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="p-5 bg-gradient-to-r from-blue-600 to-purple-600">
              <h2 className="text-xl font-semibold text-white flex items-center">
                <i className="fas fa-list mr-2"></i>Daftar Service per Hari
              </h2>
            </div>
            
            {servicesGroupedByDate.length > 0 ? (
              servicesGroupedByDate.map((group, groupIndex) => (
                <div key={groupIndex} className="mb-6 border-b border-gray-200 last:border-b-0">
                  {/* Header Grup per Hari */}
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 border-b border-blue-100">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
                      <h3 className="text-lg font-semibold text-blue-800 mb-2 md:mb-0">
                        <i className="fas fa-calendar-day mr-2"></i>
                        {group.date}
                      </h3>
                      <div className="flex flex-wrap gap-4 text-sm">
                        <div className="bg-white px-3 py-1 rounded-lg border border-blue-200">
                          <span className="text-blue-600 font-medium">Total Service: </span>
                          <span className="font-bold">{group.services.length}</span>
                        </div>
                        <div className="bg-white px-3 py-1 rounded-lg border border-green-200">
                          <span className="text-green-600 font-medium">Total Pendapatan: </span>
                          <span className="font-bold">Rp {group.totalPendapatan.toLocaleString()}</span>
                        </div>
                        <div className="bg-white px-3 py-1 rounded-lg border border-purple-200">
                          <span className="text-purple-600 font-medium">Total Laba: </span>
                          <span className="font-bold">Rp {group.totalLaba.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tabel Service untuk Hari Ini */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr className="bg-gradient-to-r from-blue-100 to-purple-100">
                          <th className="p-3 border-b border-blue-200 text-center text-blue-800">No</th>
                          <th className="p-3 border-b border-blue-200 text-blue-800">ID Service</th>
                          {!isMobile && <th className="p-3 border-b border-blue-200 text-blue-800">Pelanggan</th>}
                          {!isMobile && <th className="p-3 border-b border-blue-200 text-blue-800">Merk HP</th>}
                          {!isMobile && <th className="p-3 border-b border-blue-200 text-blue-800">Kerusakan</th>}
                          {!isMobile && <th className="p-3 border-b border-blue-200 text-blue-800">Sparepart</th>}
                          <th className="p-3 border-b border-blue-200 text-center text-blue-800">Biaya Service</th>
                          <th className="p-3 border-b border-blue-200 text-center text-blue-800">Biaya Sparepart</th>
                          <th className="p-3 border-b border-blue-200 text-center text-blue-800">Total Pendapatan</th>
                          <th className="p-3 border-b border-blue-200 text-center text-blue-800">Laba</th>
                          <th className="p-3 border-b border-blue-200 text-center text-blue-800">Status</th>
                          <th className="p-3 border-b border-blue-200 text-center text-blue-800">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.services.map((service, index) => (
                          <tr key={service.id} className={
                            service.status === 'Sudah Selesai' ? 'bg-green-50 hover:bg-green-100' : 
                            service.status === 'Batal' ? 'bg-red-50 hover:bg-red-100' : 
                            'bg-blue-50 hover:bg-blue-100'
                          }>
                            <td className="p-3 border-b border-blue-100 text-center">{index + 1}</td>
                            
                            {/* Kolom ID Service */}
                            <td className="p-3 border-b border-blue-100">
                              <span className="inline-block bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs font-mono font-bold">
                                {service.serviceId || 'N/A'}
                              </span>
                            </td>
                            
                            {!isMobile && (
                              <>
                                <td className="p-3 border-b border-blue-100">{service.namaPelanggan}</td>
                                <td className="p-3 border-b border-blue-100">{service.merkHP}</td>
                                <td className="p-3 border-b border-blue-100">{service.kerusakan}</td>
                                <td className="p-3 border-b border-blue-100">
                                  <ul className="text-sm">
                                    {service.sparepartsUsed?.map((item, i) => (
                                      <li key={i} className="mb-1">
                                        <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                                          {item.nama} (x{item.qty})
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </td>
                              </>
                            )}
                            
                            <td className="p-3 border-b border-blue-100 text-center font-semibold">
                              Rp {(service.biaya || 0).toLocaleString()}
                            </td>
                            
                            <td className="p-3 border-b border-blue-100 text-center">
                              Rp {(service.biayaSparepart || 0).toLocaleString()}
                            </td>
                            
                            <td className="p-3 border-b border-blue-100 text-center font-semibold text-green-600">
                              Rp {(service.totalPendapatan || 0).toLocaleString()}
                            </td>
                            
                            <td className="p-3 border-b border-blue-100 text-center font-semibold text-purple-600">
                              Rp {(service.totalLaba || 0).toLocaleString()}
                            </td>
                            
                            <td className="p-3 border-b border-blue-100 text-center">
                              <select
                                value={service.status}
                                onChange={(e) => updateDoc(doc(db, 'service', service.id), {
                                  status: e.target.value,
                                  tanggalUpdate: serverTimestamp()
                                }).then(fetchData)}
                                className={`border px-3 py-1 rounded-full text-xs md:text-sm font-medium ${
                                  service.status === 'Sudah Selesai' ? 'bg-green-100 text-green-800 border-green-300' :
                                  service.status === 'Batal' ? 'bg-red-100 text-red-800 border-red-300' :
                                  service.status === 'Dalam Proses' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                                  'bg-blue-100 text-blue-800 border-blue-300'
                                }`}
                              >
                                <option value="Menunggu Konfirmasi">Menunggu</option>
                                <option value="Dalam Proses">Proses</option>
                                <option value="Sudah Selesai">Selesai</option>
                                <option value="Batal">Batal</option>
                              </select>
                            </td>
                            
                            <td className="p-3 border-b border-blue-100 text-center">
                              <div className="flex gap-2 justify-center">
                                {/* PERBAIKAN: Tambah tombol cetak nota untuk service */}
                                <button
                                  onClick={() => handleCetakNotaService(service)}
                                  className="bg-blue-500 text-white px-3 py-1 rounded-full text-xs hover:bg-blue-600 transition-colors"
                                >
                                  <i className="fas fa-print mr-1"></i> Nota
                                </button>
                                <button
                                  onClick={() => handleDeleteService(service.id)}
                                  className="bg-red-500 text-white px-3 py-1 rounded-full text-xs hover:bg-red-600 transition-colors"
                                >
                                  <i className="fas fa-trash mr-1"></i> Hapus
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-gray-500">
                <i className="fas fa-inbox text-4xl mb-3 text-blue-300"></i>
                <p>Tidak ada data service</p>
              </div>
            )}

            {/* Summary Total Keseluruhan */}
            {servicesGroupedByDate.length > 0 && (
              <div className="bg-gradient-to-r from-green-50 to-teal-50 p-4 border-t border-green-200">
                <div className="flex flex-wrap justify-center gap-6 text-sm">
                  <div className="bg-white px-4 py-2 rounded-lg border border-green-300 shadow-sm">
                    <span className="text-green-700 font-medium">Total Hari: </span>
                    <span className="font-bold text-green-800">{servicesGroupedByDate.length}</span>
                  </div>
                  <div className="bg-white px-4 py-2 rounded-lg border border-blue-300 shadow-sm">
                    <span className="text-blue-700 font-medium">Total Service: </span>
                    <span className="font-bold text-blue-800">{services.length}</span>
                  </div>
                  <div className="bg-white px-4 py-2 rounded-lg border border-purple-300 shadow-sm">
                    <span className="text-purple-700 font-medium">Total Pendapatan: </span>
                    <span className="font-bold text-purple-800">
                      Rp {servicesGroupedByDate.reduce((sum, group) => sum + group.totalPendapatan, 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="bg-white px-4 py-2 rounded-lg border border-orange-300 shadow-sm">
                    <span className="text-orange-700 font-medium">Total Laba Bersih: </span>
                    <span className="font-bold text-orange-800">
                      Rp {servicesGroupedByDate.reduce((sum, group) => sum + group.totalLaba, 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {/* PERBAIKAN: TAB Input Pembelian dengan Pembayaran */}
      {activeTab === 'pembelian' && (
        <section className="mb-6 p-6 bg-gradient-to-br from-white to-indigo-50 rounded-xl shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-indigo-800 flex items-center">
            <i className="fas fa-shopping-cart mr-2"></i>Input Pembelian Barang
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            <div>
              <label className="block text-sm font-medium mb-1 text-indigo-700">Nama Supplier*</label>
              <input
                type="text"
                value={newPembelian.namaSupplier}
                onChange={(e) => setNewPembelian({...newPembelian, namaSupplier: e.target.value})}
                className="w-full p-3 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-indigo-700">Tanggal</label>
              <input
                type="date"
                value={newPembelian.tanggal.toISOString().split('T')[0]}
                onChange={(e) => setNewPembelian({...newPembelian, tanggal: new Date(e.target.value)})}
                className="w-full p-3 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              />
            </div>
          </div>

          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-3 text-indigo-700">Barang yang Dibeli</h3>
            
            {/* KOLOM PENCARIAN BARANG - SAMA PERSIS DENGAN PENJUALAN */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 text-indigo-700">
                <i className="fas fa-search mr-2"></i>Cari Barang
              </label>
              <input
                type="text"
                placeholder="Cari barang berdasarkan nama atau kode..."
                value={searchBarangPembelian}
                onChange={(e) => setSearchBarangPembelian(e.target.value)}
                className="w-full p-3 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              />
              {searchBarangPembelian && (
                <p className="text-sm text-indigo-600 mt-1">
                  Menampilkan {filteredBarangPembelian.length} barang ditemukan
                </p>
              )}
            </div>
            
            {newPembelian.items.map((item, index) => (
              <div key={index} className="flex gap-2 items-center p-3 bg-indigo-50 rounded-lg mb-2">
                <select
                  value={item.nama_barang}
                  onChange={(e) => handleUpdatePembelianItem(index, 'nama_barang', e.target.value)}
                  className="flex-1 p-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                >
                  <option value="">Pilih Barang</option>
                  {filteredBarangPembelian.map(product => (
                    <option key={product.id} value={product.nama_barang}>
                      {product.nama_barang} 
                      {product.kode_barang && ` (${product.kode_barang})`} 
                      - Stok: {product.qty - product.terpakai} 
                      - Harga: Rp {product.harga_beli?.toLocaleString()}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={item.qty}
                  onChange={(e) => handleUpdatePembelianItem(index, 'qty', e.target.value)}
                  className="w-20 p-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  min="1"
                  placeholder="Qty"
                />
                <input
                  type="number"
                  value={item.harga_beli}
                  onChange={(e) => handleUpdatePembelianItem(index, 'harga_beli', e.target.value)}
                  className="w-32 p-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  min="0"
                  placeholder="Harga Beli"
                />
                <span className="w-32 p-2 text-sm font-semibold">
                  Rp {item.subtotal?.toLocaleString()}
                </span>
                <button
                  onClick={() => handleRemovePembelianItem(index)}
                  className="text-red-500 px-2 hover:text-red-700 transition-colors"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
            ))}

            <button
              onClick={handleAddPembelianItem}
              className="text-indigo-600 font-medium text-sm flex items-center gap-2 mt-2 p-2 hover:bg-indigo-100 rounded-lg transition-all"
            >
              <i className="fas fa-plus-circle"></i> Tambah Barang
            </button>
          </div>

          {/* PERBAIKAN: Tambah input pembayaran untuk pembelian */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="flex justify-between items-center p-4 bg-indigo-100 rounded-lg">
              <span className="text-lg font-semibold text-indigo-800">Total Pembelian:</span>
              <span className="text-xl font-bold text-indigo-800">
                Rp {newPembelian.totalHarga.toLocaleString()}
              </span>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-indigo-700">Pembayaran (Rp)</label>
              <input
                type="number"
                value={newPembelian.pembayaran}
                onChange={(e) => handlePembayaranPembelianChange(Math.max(0, Number(e.target.value)))}
                className="w-full p-3 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-indigo-700">Kembalian (Rp)</label>
              <input
                type="number"
                value={newPembelian.kembalian}
                readOnly
                className="w-full p-3 border border-indigo-200 rounded-lg bg-gray-100 text-gray-700"
              />
            </div>
          </div>

          <button 
            onClick={handleSubmitPembelian}
            className="mt-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-6 py-3 rounded-lg font-medium hover:from-indigo-600 hover:to-purple-600 transition-all shadow-md hover:shadow-lg flex items-center"
          >
            <i className="fas fa-save mr-2"></i> Simpan Pembelian
          </button>
        </section>
      )}

      {/* PERBAIKAN: TAB Input Penjualan dengan Pembayaran */}
      {activeTab === 'penjualan' && (
        <section className="mb-6 p-6 bg-gradient-to-br from-white to-green-50 rounded-xl shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-green-800 flex items-center">
            <i className="fas fa-shopping-cart mr-2"></i>Input Penjualan Barang
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            <div>
              <label className="block text-sm font-medium mb-1 text-green-700">Nama Pembeli*</label>
              <input
                type="text"
                value={newPenjualan.namaPembeli}
                onChange={(e) => setNewPenjualan({...newPenjualan, namaPembeli: e.target.value})}
                className="w-full p-3 border border-green-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-green-700">Tanggal</label>
              <input
                type="date"
                value={newPenjualan.tanggal.toISOString().split('T')[0]}
                onChange={(e) => setNewPenjualan({...newPenjualan, tanggal: new Date(e.target.value)})}
                className="w-full p-3 border border-green-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
              />
            </div>
          </div>

          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-3 text-green-700">Barang yang Dijual</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 text-green-700">
                <i className="fas fa-search mr-2"></i>Cari Barang
              </label>
              <input
                type="text"
                placeholder="Cari barang berdasarkan nama atau kode..."
                value={searchPenjualan}
                onChange={(e) => setSearchPenjualan(e.target.value)}
                className="w-full p-3 border border-green-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
              />
              {searchPenjualan && (
                <p className="text-sm text-green-600 mt-1">
                  Menampilkan {filteredBarangPenjualan.length} barang ditemukan
                </p>
              )}
            </div>
            
            {newPenjualan.items.map((item, index) => (
              <div key={index} className="flex gap-2 items-center p-3 bg-green-50 rounded-lg mb-2">
                <select
                  value={item.nama_barang}
                  onChange={(e) => handleUpdatePenjualanItem(index, 'nama_barang', e.target.value)}
                  className="flex-1 p-2 border border-green-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                >
                  <option value="">Pilih Barang</option>
                  {filteredBarangPenjualan.map(product => (
                    <option key={product.id} value={product.nama_barang}>
                      {product.nama_barang} 
                      {product.kode_barang && ` (${product.kode_barang})`} 
                       Stok: {product.qty - product.terpakai} 
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={item.qty}
                  onChange={(e) => handleUpdatePenjualanItem(index, 'qty', e.target.value)}
                  className="w-20 p-2 border border-green-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                  min="1"
                />
                <span className="w-32 p-2 text-sm">
                  Rp {item.harga?.toLocaleString()}
                </span>
                <span className="w-32 p-2 text-sm font-semibold">
                  Rp {item.subtotal?.toLocaleString()}
                </span>
                <button
                  onClick={() => handleRemovePenjualanItem(index)}
                  className="text-red-500 px-2 hover:text-red-700 transition-colors"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
            ))}

            <button
              onClick={handleAddPenjualanItem}
              className="text-green-600 font-medium text-sm flex items-center gap-2 mt-2 p-2 hover:bg-green-100 rounded-lg transition-all"
            >
              <i className="fas fa-plus-circle"></i> Tambah Barang
            </button>
          </div>

          {/* PERBAIKAN: Tambah input pembayaran untuk penjualan */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="flex justify-between items-center p-4 bg-green-100 rounded-lg">
              <span className="text-lg font-semibold text-green-800">Total Harga:</span>
              <span className="text-xl font-bold text-green-800">
                Rp {newPenjualan.totalHarga.toLocaleString()}
              </span>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-green-700">Pembayaran (Rp)</label>
              <input
                type="number"
                value={newPenjualan.pembayaran}
                onChange={(e) => handlePembayaranPenjualanChange(Math.max(0, Number(e.target.value)))}
                className="w-full p-3 border border-green-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-green-700">Kembalian (Rp)</label>
              <input
                type="number"
                value={newPenjualan.kembalian}
                readOnly
                className="w-full p-3 border border-green-200 rounded-lg bg-gray-100 text-gray-700"
              />
            </div>
          </div>

          <button 
            onClick={handleSubmitPenjualan}
            className="mt-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white px-6 py-3 rounded-lg font-medium hover:from-green-600 hover:to-emerald-600 transition-all shadow-md hover:shadow-lg flex items-center"
          >
            <i className="fas fa-save mr-2"></i> Simpan Penjualan
          </button>
        </section>
      )}

      {/* TAB BARU: Riwayat Pembelian */}
      {activeTab === 'riwayat-pembelian' && (
        <section className="mb-10 bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-5 bg-gradient-to-r from-purple-600 to-pink-600">
            <h2 className="text-xl font-semibold text-white flex items-center">
              <i className="fas fa-file-invoice mr-2"></i>Riwayat Pembelian
            </h2>
            <div className="mt-2">
              <input
                type="text"
                placeholder="Cari berdasarkan supplier atau nama barang..."
                value={searchPembelian}
                onChange={(e) => setSearchPembelian(e.target.value)}
                className="w-full p-2 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white/80 backdrop-blur-sm"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gradient-to-r from-purple-100 to-pink-100">
                  <th className="p-3 border-b border-purple-200 text-center text-purple-800">No</th>
                  <th className="p-3 border-b border-purple-200 text-purple-800">Tanggal</th>
                  <th className="p-3 border-b border-purple-200 text-purple-800">Supplier</th>
                  <th className="p-3 border-b border-purple-200 text-purple-800">Barang</th>
                  <th className="p-3 border-b border-purple-200 text-center text-purple-800">Total</th>
                  <th className="p-3 border-b border-purple-200 text-center text-purple-800">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredPembelian.length > 0 ? (
                  filteredPembelian.map((item, index) => (
                    <tr key={item.id} className="hover:bg-purple-50">
                      <td className="p-3 border-b border-purple-100 text-center">{index + 1}</td>
                      <td className="p-3 border-b border-purple-100">{item.formattedDate}</td>
                      <td className="p-3 border-b border-purple-100">{item.namaSupplier}</td>
                      <td className="p-3 border-b border-purple-100">
                        {item.items?.map(i => `${i.nama_barang} (${i.qty})`).join(', ')}
                      </td>
                      <td className="p-3 border-b border-purple-100 text-center font-semibold">
                        Rp {item.totalHarga?.toLocaleString()}
                      </td>
                      <td className="p-3 border-b border-purple-100 text-center">
                        <button
                          onClick={() => handleCetakNotaPembelian(item)}
                          className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 transition-colors"
                        >
                          <i className="fas fa-print mr-1"></i> Cetak Nota
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-gray-500">
                      <i className="fas fa-inbox text-4xl mb-3 text-purple-300"></i>
                      <p>{searchPembelian ? 'Tidak ada data pembelian yang sesuai' : 'Belum ada data pembelian'}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB Riwayat Penjualan */}
      {activeTab === 'riwayat-penjualan' && (
        <section className="mb-10 bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-5 bg-gradient-to-r from-orange-600 to-red-600">
            <h2 className="text-xl font-semibold text-white flex items-center">
              <i className="fas fa-history mr-2"></i>Riwayat Penjualan
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gradient-to-r from-orange-100 to-red-100">
                  <th className="p-3 border-b border-orange-200 text-center text-orange-800">No</th>
                  <th className="p-3 border-b border-orange-200 text-orange-800">Tanggal</th>
                  <th className="p-3 border-b border-orange-200 text-orange-800">Pembeli</th>
                  <th className="p-3 border-b border-orange-200 text-orange-800">Barang</th>
                  <th className="p-3 border-b border-orange-200 text-center text-orange-800">Total</th>
                  <th className="p-3 border-b border-orange-200 text-center text-orange-800">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {penjualan.length > 0 ? (
                  penjualan.map((item, index) => (
                    <tr key={item.id} className="hover:bg-orange-50">
                      <td className="p-3 border-b border-orange-100 text-center">{index + 1}</td>
                      <td className="p-3 border-b border-orange-100">{item.formattedDate}</td>
                      <td className="p-3 border-b border-orange-100">{item.namaPembeli}</td>
                      <td className="p-3 border-b border-orange-100">
                        {item.items?.map(i => i.nama_barang).join(', ')}
                      </td>
                      <td className="p-3 border-b border-orange-100 text-center font-semibold">
                        Rp {item.totalHarga?.toLocaleString()}
                      </td>
                      <td className="p-3 border-b border-orange-100 text-center">
                        <button
                          onClick={() => handleCetakNota(item)}
                          className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 transition-colors"
                        >
                          <i className="fas fa-print mr-1"></i> Cetak Nota
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-gray-500">
                      <i className="fas fa-inbox text-4xl mb-3 text-orange-300"></i>
                      <p>Belum ada data penjualan</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'stok' && (
        /* Tab Manajemen Stok - TETAP SAMA */
        <>
          <section className="mb-6 p-4 bg-gray-100 rounded-lg">
            <h2 className="text-lg font-semibold mb-3">
              {editing ? 'Edit Barang' : 
               bulkAddMode ? 'Tambah Barang Massal' : 'Tambah Barang'}
            </h2>

            {bulkAddMode ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Format (Copy dari Excel/Spreadsheet):
                  </label>
                  <textarea
                    value={bulkData}
                    onChange={(e) => setBulkData(e.target.value)}
                    className="w-full p-2 border rounded h-40 font-mono text-sm"
                    placeholder={`Kode Barang\tNama Barang\tQty\tHarga Beli\tHarga Jual\nPRB-VV621\tPERNIK RUBBER VOL VIVO Y15S BLUE\t3\t1650\t2500\nPRB-VV622\tPERNIK RUBBER VOL VIVO Y15S GREEN\t3\t1650\t2500`}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleBulkAdd}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
                  >
                    Tambah Massal
                  </button>
                  <button
                    onClick={() => {
                      setBulkAddMode(false);
                      setBulkData('');
                    }}
                    className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition"
                  >
                    Batal
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Kode Barang*</label>
                    <input
                      type="text"
                      value={editing ? editing.kode_barang : newBarang.kode_barang}
                      onChange={(e) => 
                        editing 
                          ? setEditing({...editing, kode_barang: e.target.value}) 
                          : setNewBarang({...newBarang, kode_barang: e.target.value})
                      }
                      className="w-full p-2 border rounded"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Nama Barang*</label>
                    <input
                      type="text"
                      value={editing ? editing.nama_barang : newBarang.nama_barang}
                      onChange={(e) => 
                        editing 
                          ? setEditing({...editing, nama_barang: e.target.value}) 
                          : setNewBarang({...newBarang, nama_barang: e.target.value})
                      }
                      className="w-full p-2 border rounded"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Qty*</label>
                    <input
                      type="number"
                      value={editing ? editing.qty : newBarang.qty}
                      onChange={(e) => 
                        editing 
                          ? setEditing({...editing, qty: e.target.value}) 
                          : setNewBarang({...newBarang, qty: e.target.value})
                      }
                      className="w-full p-2 border rounded"
                      min="0"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Harga Beli (Rp)*</label>
                    <input
                      type="number"
                      value={editing ? editing.harga_beli : newBarang.harga_beli}
                      onChange={(e) => 
                        editing 
                          ? setEditing({...editing, harga_beli: e.target.value}) 
                          : setNewBarang({...newBarang, harga_beli: e.target.value})
                      }
                      className="w-full p-2 border rounded"
                      min="0"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Harga Jual (Rp)*</label>
                    <input
                      type="number"
                      value={editing ? editing.harga_jual : newBarang.harga_jual}
                      onChange={(e) => 
                        editing 
                          ? setEditing({...editing, harga_jual: e.target.value}) 
                          : setNewBarang({...newBarang, harga_jual: e.target.value})
                      }
                      className="w-full p-2 border rounded"
                      min="0"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Terpakai</label>
                    <input
                      type="number"
                      value={editing ? editing.terpakai : newBarang.terpakai}
                      onChange={(e) => 
                        editing 
                          ? setEditing({...editing, terpakai: e.target.value}) 
                          : setNewBarang({...newBarang, terpakai: e.target.value})
                      }
                      className="w-full p-2 border rounded"
                      min="0"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  {editing ? (
                    <>
                      <button
                        onClick={handleUpdateBarang}
                        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
                      >
                        Simpan
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition"
                      >
                        Batal
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleAddBarang}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                      >
                        Tambah
                      </button>
                      <button
                        onClick={() => setBulkAddMode(true)}
                        className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition"
                      >
                        Tambah Banyak Produk
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </section>

          <section>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-2">
              <h2 className="text-lg font-semibold">Daftar Stok Barang</h2>
              <div className="flex gap-2 w-full md:w-auto">
                <input
                  type="text"
                  placeholder="Cari barang..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full md:w-64 p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border">
                <thead>
                  <tr className="bg-gray-200">
                    <th className="p-2 border">No</th>
                    <th className="p-2 border">Kode Barang</th>
                    <th className="p-2 border">Nama Barang</th>
                    <th className="p-2 border text-center">Qty</th>
                    <th className="p-2 border text-center">Terpakai</th>
                    <th className="p-2 border text-center">Sisa</th>
                    <th className="p-2 border text-center">Harga Beli</th>
                    <th className="p-2 border text-center">Harga Jual</th>
                    <th className="p-2 border text-center">Keuntungan</th>
                    <th className="p-2 border text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStokBarang.length > 0 ? (
                    filteredStokBarang.map((item, index) => (
                      <tr key={item.id} className="bg-white">
                        <td className="p-2 border">{index + 1}</td>
                        <td className="p-2 border">{item.kode_barang}</td>
                        <td className="p-2 border">{item.nama_barang}</td>
                        <td className="p-2 border text-center">{item.qty}</td>
                        <td className="p-2 border text-center">{item.terpakai}</td>
                        <td className="p-2 border text-center">{item.qty - item.terpakai}</td>
                        <td className="p-2 border text-center">
                          Rp {item.harga_beli?.toLocaleString('id-ID') || '0'}
                        </td>
                        <td className="p-2 border text-center">
                          Rp {item.harga_jual?.toLocaleString('id-ID') || '0'}
                        </td>
                        <td className={`p-2 border text-center ${
                          (item.harga_jual - item.harga_beli) >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          Rp {(item.harga_jual - item.harga_beli)?.toLocaleString('id-ID') || '0'}
                        </td>
                        <td className="p-2 border text-center">
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
                            className="text-blue-500 mr-2"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteBarang(item.id)}
                            className="text-red-500"
                          >
                            Hapus
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="p-4 text-center">
                        {searchTerm
                          ? 'Barang tidak ditemukan'
                          : 'Tidak ada data stok barang'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}