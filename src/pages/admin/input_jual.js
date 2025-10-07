import { useEffect, useState } from "react";
import { collection, getDocs, addDoc, doc, updateDoc, increment } from "firebase/firestore";
import { db } from "../../firebase/config";
import NotaPenjualan from "@/components/NotaPenjualan";

export default function InputJual() {
  const [stokBarang, setStokBarang] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItems, setSelectedItems] = useState([]);
  const [namaPembeli, setNamaPembeli] = useState("");
  const [notaData, setNotaData] = useState(null);

  // ambil stok dari firestore
  useEffect(() => {
    const fetchStok = async () => {
      const querySnapshot = await getDocs(collection(db, "stok"));
      setStokBarang(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    fetchStok();
  }, []);

  // pilih barang
  const handleSelectBarang = (barang) => {
    if (selectedItems.some(item => item.id === barang.id)) return;
    setSelectedItems([...selectedItems, { ...barang, qtyJual: 1 }]);
    setSearchTerm("");
  };

  // update qty barang yg dipilih
  const handleQtyChange = (id, qty) => {
    setSelectedItems(
      selectedItems.map(item =>
        item.id === id ? { ...item, qtyJual: Number(qty) } : item
      )
    );
  };

  // simpan penjualan
  const handleSimpan = async () => {
    if (!namaPembeli) {
      alert("Nama pembeli wajib diisi!");
      return;
    }
    if (selectedItems.length === 0) {
      alert("Pilih minimal 1 barang!");
      return;
    }

    // validasi stok
    for (let item of selectedItems) {
      if (item.qtyJual > item.qty) {
        alert(`Stok untuk ${item.nama_barang} tidak mencukupi!`);
        return;
      }
    }

    // simpan ke collection Penjualan
    const penjualanRef = await addDoc(collection(db, "penjualan"), {
      namaPembeli,
      items: selectedItems.map(item => ({
        id: item.id,
        nama_barang: item.nama_barang,
        qty: item.qtyJual,
        harga_jual: item.harga_jual
      })),
      created_at: new Date()
    });

    // update stok
    for (let item of selectedItems) {
      await updateDoc(doc(db, "stok", item.id), {
        qty: increment(-item.qtyJual),
        terpakai: increment(item.qtyJual),
        updated_at: new Date()
      });
    }

    // tampilkan nota
    setNotaData({
      id: penjualanRef.id,
      namaPembeli,
      items: selectedItems
    });

    // reset form
    setSelectedItems([]);
    setNamaPembeli("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-200 via-purple-200 to-pink-100 p-6">
      <div className="bg-white w-full max-w-3xl rounded-xl shadow-lg p-6">
        <h1 className="text-2xl font-bold mb-6 text-center bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          🛒 Input Penjualan Barang
        </h1>

        {/* Input Nama Pembeli */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Nama Pembeli</label>
          <input
            type="text"
            value={namaPembeli}
            onChange={(e) => setNamaPembeli(e.target.value)}
            className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-400"
            placeholder="Masukkan nama pembeli"
          />
        </div>

        {/* Search Barang */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Cari Barang</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full border px-3 py-2 rounded-lg"
            placeholder="Ketik kode atau nama barang..."
          />
          {searchTerm && (
            <div className="border rounded-lg mt-1 bg-white shadow max-h-40 overflow-y-auto">
              {stokBarang
                .filter(
                  (item) =>
                    item.kode_barang.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    item.nama_barang.toLowerCase().includes(searchTerm.toLowerCase())
                )
                .map((item) => (
                  <div
                    key={item.id}
                    className="p-2 hover:bg-indigo-100 cursor-pointer"
                    onClick={() => handleSelectBarang(item)}
                  >
                    {item.kode_barang} - {item.nama_barang} (Stok: {item.qty})
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Daftar Barang yg Dipilih */}
        {selectedItems.length > 0 && (
          <table className="w-full border mb-4">
            <thead className="bg-indigo-100">
              <tr>
                <th className="p-2 text-left">Barang</th>
                <th className="p-2">Harga</th>
                <th className="p-2">Qty</th>
                <th className="p-2">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {selectedItems.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="p-2">{item.nama_barang}</td>
                  <td className="p-2 text-right">
                    Rp {item.harga_jual.toLocaleString("id-ID")}
                  </td>
                  <td className="p-2 text-center">
                    <input
                      type="number"
                      min="1"
                      max={item.qty}
                      value={item.qtyJual}
                      onChange={(e) => handleQtyChange(item.id, e.target.value)}
                      className="w-16 border rounded px-2 py-1 text-center"
                    />
                  </td>
                  <td className="p-2 text-right">
                    Rp {(item.harga_jual * item.qtyJual).toLocaleString("id-ID")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Tombol Simpan & Kembali */}
        <div className="flex justify-between">
          <button
            onClick={() => history.back()}
            className="px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500"
          >
            Kembali
          </button>
          <button
            onClick={handleSimpan}
            className="px-6 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg shadow hover:opacity-90"
          >
            Simpan Penjualan
          </button>
        </div>
      </div>

      {/* Popup Nota PDF */}
      {notaData && (
        <NotaPenjualan
          notaData={notaData}
          onClose={() => setNotaData(null)}
        />
      )}
    </div>
  );
}
