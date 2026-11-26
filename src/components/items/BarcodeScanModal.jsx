// Barcode scanner modal component supporting camera, USB barcode reader, and manual entry
import { useEffect, useRef, useState } from "react";
import { FiCamera, FiX } from "react-icons/fi";
import Button from "../Common/Button";
import Card from "../Common/Card";

export default function BarcodeScanModal({ onScan, onClose, title = "Scan or Enter Barcode" }) {
  const [manualCode, setManualCode] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const streamRef = useRef(null);
  const scannedRef = useRef(false);

  const stopCamera = (updateState = true) => {
    try {
      controlsRef.current?.stop();
    } catch {}
    controlsRef.current = null;
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    } catch {}
    streamRef.current = null;
    if (updateState) {
      setCameraOpen(false);
    }
  };

  const startCamera = async () => {
    scannedRef.current = false;
    setCameraOpen(true);
    setScanStatus("Requesting camera...");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access is not supported in this browser or requires HTTPS/localhost.");
      }
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (!videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setScanStatus("Point camera at barcode...");
      controlsRef.current = await reader.decodeFromVideoElement(videoRef.current, (result) => {
        if (result && !scannedRef.current) {
          scannedRef.current = true;
          const text = result.getText();
          stopCamera();
          onScan(text);
        }
      });
    } catch (err) {
      setScanStatus(err?.message || "Could not access camera. Please check camera permissions.");
    }
  };

  useEffect(() => {
    return () => stopCamera(false);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 animate-in fade-in duration-150">
      <Card className="w-full max-w-md overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <FiCamera className="text-blue-600" />
            {title}
          </h2>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <FiX size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-500">
            Scan using a USB barcode scanner, use your device camera, or type the code below.
          </p>
          <div className="flex gap-2">
            <input
              autoFocus
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && manualCode.trim()) {
                  e.preventDefault();
                  stopCamera();
                  onScan(manualCode.trim());
                }
              }}
              placeholder="Scan barcode or enter code"
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <Button
              onClick={() => {
                if (manualCode.trim()) {
                  stopCamera();
                  onScan(manualCode.trim());
                }
              }}
              className="bg-blue-600 text-white hover:bg-blue-700 font-semibold"
            >
              Apply
            </Button>
          </div>
          {cameraOpen ? (
            <div className="space-y-2">
              <div className="relative rounded-lg overflow-hidden bg-black">
                <video ref={videoRef} className="h-48 w-full object-cover" />
                <div className="absolute inset-0 border-2 border-red-500/60 pointer-events-none m-6 rounded-md flex items-center justify-center">
                  <div className="w-full h-0.5 bg-red-500 animate-pulse" />
                </div>
              </div>
              <p className="text-xs text-center text-slate-600 font-medium">{scanStatus}</p>
              <Button onClick={stopCamera} className="w-full bg-slate-100 text-slate-700 hover:bg-slate-200">
                Stop Camera
              </Button>
            </div>
          ) : (
            <Button onClick={startCamera} className="w-full border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2">
              <FiCamera className="text-blue-600" /> Scan with Camera
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
