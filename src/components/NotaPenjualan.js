import { useRef } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export default function NotaPenjualan({ notaData, onClose }) {
  const notaRef = useRef();

  const handleDownloadPDF = async () => {
    const element = notaRef.current;
    const canvas = await html2canvas(element, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF("p", "mm", "a4");
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
    pdf.save(`nota-${notaData.id || Date.now()}.pdf`);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        {/* REF untuk export PDF */}
        <div ref={notaRef} className="font-mono">
          <h2 className="text-xl font-bold text-center mb-2">
            📱 Goku Komunika
          </h2>
          <p className="text-center text-sm mb-4">
            Jl. Parakanmuncang, Sindang Kasih, Kec. Cimanggung, Kabupaten Sumedang, Jawa Barat 45364 <br /> Telp: 0812-3456-7890
          </p>

          <hr className="my-2" />

          <div className="mb-2">
            <p>
              <span className="font-semibold">Tanggal:</span>{" "}
              {new Date().toLocaleString("id-ID")}
            </p>
            <p>
              <span className="font-semibold">Nama Pembeli:</span>{" "}
              {notaData.namaPembeli}
            </p>
          </div>

          <hr className="my-2" />

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left">Barang</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Harga</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {notaData.items.map((item, idx) => (
                <tr key={idx}>
                  <td>{item.nama_barang}</td>
                  <td className="text-right">{item.qty}</td>
                  <td className="text-right">
                    Rp {item.harga_jual.toLocaleString("id-ID")}
                  </td>
                  <td className="text-right">
                    Rp {(item.harga_jual * item.qty).toLocaleString("id-ID")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <hr className="my-2" />

          <p className="text-right font-bold text-lg">
            Total: Rp{" "}
            {notaData.items
              .reduce((sum, i) => sum + i.harga_jual * i.qty, 0)
              .toLocaleString("id-ID")}
          </p>

          <p className="text-center mt-4 text-sm italic">
            Terima kasih telah berbelanja di Goku Komunika 🙏
          </p>
        </div>

        {/* Tombol Aksi */}
        <div className="mt-4 flex justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
          >
            Tutup
          </button>
          <button
            onClick={handleDownloadPDF}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}
