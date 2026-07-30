"use client";

import { useState } from "react";

export default function CBUForm() {
  const [exchangeRate, setExchangeRate] = useState(25500);
  const [materialCost, setMaterialCost] = useState(0);
  // Add other necessary states...

  return (
    <div className="bg-white p-4 shadow rounded">
      <h3 className="font-semibold text-lg mb-4">CBU Calculation Form</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">Exchange Rate</label>
          <input 
            type="number" 
            value={exchangeRate}
            onChange={(e) => setExchangeRate(Number(e.target.value))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Material Cost</label>
          <input 
            type="number" 
            value={materialCost}
            onChange={(e) => setMaterialCost(Number(e.target.value))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
          />
        </div>
      </div>
      <div className="mt-4 p-4 bg-gray-50 border rounded">
        <p className="text-sm font-semibold">Live Calculated Results will appear here.</p>
      </div>
    </div>
  );
}
