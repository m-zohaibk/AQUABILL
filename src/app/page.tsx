'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import {
  useFirebase,
  useCollection,
  useDoc,
  useMemoFirebase,
  setDocumentNonBlocking,
  addDocumentNonBlocking,
  updateDocumentNonBlocking,
  deleteDocumentNonBlocking,
  FirebaseClientProvider,
} from '@/firebase';
import { collection, doc, getDocs } from 'firebase/firestore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

// --- Simple UI primitives (Tailwind-only) to avoid external UI deps ---
const Btn = ({ children, className = '', ...props }) => (
  <button
    className={`px-3 py-2 rounded-xl shadow-sm border text-sm hover:shadow transition disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    {...props}
  >
    {children}
  </button>
);
const Input = ({ className = '', ...props }) => (
  <input
    className={`w-full px-3 py-2 rounded-xl border outline-none focus:ring focus:ring-indigo-200 ${className}`}
    {...props}
  />
);
const Label = ({ children, className = '', ...props }) => (
  <label className={`text-sm text-gray-700 ${className}`} {...props}>
    {children}
  </label>
);
const Card = ({ children, className = '', ...props }) => (
  <div
    className={`rounded-2xl border bg-white shadow-sm ${className}`}
    {...props}
  >
    {children}
  </div>
);
const SectionTitle = ({ children }) => (
  <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
);

// --- Helpers ---
const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

const minutesBetween = (start, end) => {
  const s = parseTimeToMinutes(start);
  const e = parseTimeToMinutes(end);
  if (isNaN(s) || isNaN(e)) return 0;
  const diff = e >= s ? e - s : e + 24 * 60 - s;
  return Math.max(0, diff);
};

const roundAbout = (num) => Math.round(num);

const formatPKR = (num) => {
  if (isNaN(num)) return 'PKR 0';
  return `PKR ${roundAbout(num)}`;
};


const defaultSettings = {
  ratePerMinute: 16.666,
  businessName: 'Tubewell Water Supply',
  businessContact: '0300-0000000',
  businessAddress: 'Your Area, Your City',
};

// --- Main App Entry ---
export default function AppWrapper() {
  return (
    <FirebaseClientProvider>
      <App />
    </FirebaseClientProvider>
  );
}

// --- Main App ---
function App() {
  const { firestore } = useFirebase();
  const [search, setSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [view, setView] = useState('invoices'); // invoices | settings | about
  const [customerToDelete, setCustomerToDelete] = useState(null);

  // --- Firestore Data ---
  const customersRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'customers') : null),
    [firestore]
  );
  const { data: customers = [] } = useCollection(customersRef);

  const invoicesRef = useMemoFirebase(
    () =>
      firestore && selectedCustomerId
        ? collection(firestore, 'customers', selectedCustomerId, 'invoices')
        : null,
    [firestore, selectedCustomerId]
  );
  const { data: customerInvoices = [] } = useCollection(invoicesRef);

  const settingsRef = useMemoFirebase(
    () => (firestore ? doc(firestore, 'settings', 'default') : null),
    [firestore]
  );
  const { data: settingsData } = useDoc(settingsRef);
  const settings = settingsData ? { ...defaultSettings, ...settingsData } : defaultSettings;

  // Derived
  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return (customers || []).filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.contact || '').toLowerCase().includes(q)
    );
  }, [customers, search]);

  const selectedCustomer =
    (customers || []).find((c) => c.id === selectedCustomerId) || null;

  // Actions: Customers
  const addCustomer = (name, contact) => {
    if (!firestore) return;
    const customersCol = collection(firestore, 'customers');
    addDocumentNonBlocking(customersCol, { name, contact }).then((docRef) => {
      if(docRef) setSelectedCustomerId(docRef.id);
    });
  };

  const updateCustomer = (id, updates) => {
    if (!firestore) return;
    const customerDoc = doc(firestore, 'customers', id);
    updateDocumentNonBlocking(customerDoc, updates);
  };

  const deleteCustomer = (id) => {
    if (!firestore) return;
    const customerDoc = doc(firestore, 'customers', id);
    deleteDocumentNonBlocking(customerDoc);
    // Note: Deleting subcollections needs a more complex implementation (e.g., a cloud function)
    // For now, invoices will be orphaned but won't appear in the UI.
    if (selectedCustomerId === id) setSelectedCustomerId(null);
    setCustomerToDelete(null);
  };

  // Actions: Invoices
  const addInvoice = (payload) => {
    if (!firestore || !selectedCustomerId) return;
    const invoicesCol = collection(firestore, 'customers', selectedCustomerId, 'invoices');
    addDocumentNonBlocking(invoicesCol, {
      ...payload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  const updateInvoice = (id, updates) => {
    if (!firestore || !selectedCustomerId) return;
    const invoiceDoc = doc(firestore, 'customers', selectedCustomerId, 'invoices', id);
    updateDocumentNonBlocking(invoiceDoc, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  };

  const deleteInvoice = (id) => {
    if (!firestore || !selectedCustomerId) return;
    const invoiceDoc = doc(firestore, 'customers', selectedCustomerId, 'invoices', id);
    deleteDocumentNonBlocking(invoiceDoc);
  };

  const updateSettings = (newSettings) => {
    if (!firestore) return;
    const settingsDoc = doc(firestore, 'settings', 'default');
    setDocumentNonBlocking(settingsDoc, newSettings, { merge: true });
  };
  
    // Export Settings JSON
  const exportSettings = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tubewell-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSettings = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result as string);
        updateSettings(obj);
        alert("Settings imported.");
      } catch {
        alert("Invalid settings file.");
      }
    };
    reader.readAsText(file);
  };


  // Export Customer History PDF
  const exportCustomerHistoryPDF = (customer) => {
    if (!customerInvoices) return;
    const doc = new jsPDF();
    const title = 'Tubewell Water Supply Invoice History';
    doc.setFontSize(16);
    doc.text(title, 14, 18);

    doc.setFontSize(11);
    doc.text(`Customer: ${customer.name}`, 14, 28);
    if (customer.contact) doc.text(`Contact: ${customer.contact}`, 14, 34);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 40);

    const rows = customerInvoices
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map((i) => {
        const mins = i.durationMinutes;
        const total = i.totalCost;
        const rounded = roundAbout(total);
        return [
          i.date,
          `${i.startTime} - ${i.endTime}`,
          `${mins} min`,
          roundAbout(i.ratePerMinute ?? settings.ratePerMinute),
          roundAbout(total),
          roundAbout(i.amountReceived ?? 0),
          roundAbout(i.amountPending),
        ];
      });

    (doc as any).autoTable({
      startY: 48,
      head: [
        [
          'Date',
          'Time',
          'Duration',
          'Rate/min',
          'Total',
          'Received',
          'Pending',
        ],
      ],
      body: rows,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [66, 99, 235] },
      theme: 'striped',
    });

    doc.save(`${customer.name.replace(/\s+/g, '_')}_invoice_history.pdf`);
  };
  
  const handleViewAllCustomers = () => {
    setSelectedCustomerId(null);
    setView('invoices');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="size-9 grid place-content-center rounded-xl bg-indigo-600 text-white font-bold">
              TW
            </span>
            <div>
              <h1 className="text-xl font-bold">
                Tubewell Water Supply Invoice
              </h1>
              <p className="text-xs text-gray-500">
                Manage customers, create invoices, and track payments.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
           <Btn
              className={`hidden sm:inline-flex ${
                !selectedCustomerId && view === 'invoices' ? 'bg-indigo-600 text-white' : ''
              }`}
              onClick={handleViewAllCustomers}
            >
              Dashboard
            </Btn>
            <Btn
              className={`${
                view === 'settings' ? 'bg-indigo-600 text-white' : ''
              }`}
              onClick={() => setView('settings')}
            >
              Settings
            </Btn>
            <Btn
              className={`${view === 'about' ? 'bg-indigo-600 text-white' : ''}`}
              onClick={() => setView('about')}
            >
              Help
            </Btn>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-6">
        {/* Sidebar */}
        <aside>
          <Card className="p-4">
            <SectionTitle>Customers</SectionTitle>
            <div className="mt-3">
              <Input
                placeholder="Search by name or number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="mt-3 space-y-2 max-h-[52vh] overflow-auto pr-1">
              {(filteredCustomers || []).map((c) => (
                <div
                  key={c.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                    selectedCustomerId === c.id
                      ? 'bg-indigo-50 border-indigo-200'
                      : 'bg-white'
                  }`}
                >
                  <button
                    className="text-left flex-1"
                    onClick={() => {
                      setSelectedCustomerId(c.id);
                      setView('invoices');
                    }}
                  >
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-gray-500">
                      {c.contact || 'No contact'}
                    </div>
                  </button>
                  <div className="flex gap-2">
                    <Btn
                      className="text-xs"
                      onClick={() => {
                        const name = prompt('Customer name', c.name);
                        if (!name) return;
                        const contact = prompt('Contact number', c.contact || '');
                        updateCustomer(c.id, { name, contact });
                      }}
                    >
                      Edit
                    </Btn>
                    <Btn
                      className="text-xs border-red-200 text-red-600"
                      onClick={() => setCustomerToDelete(c)}
                    >
                      Del
                    </Btn>
                  </div>
                </div>
              ))}
              {filteredCustomers && filteredCustomers.length === 0 && (
                <p className="text-sm text-gray-500 py-4 text-center">
                  No customers found.
                </p>
              )}
            </div>

            <div className="mt-4 p-3 rounded-xl bg-gray-50 border">
              <SectionTitle>Add Customer</SectionTitle>
              <CustomerForm onSubmit={addCustomer} />
            </div>
          </Card>
        </aside>

        {/* Main Content */}
        <section>
          {view === 'invoices' && selectedCustomer && (
            <InvoicesView
              settings={settings}
              selectedCustomer={selectedCustomer}
              customerInvoices={customerInvoices}
              onAddInvoice={addInvoice}
              onUpdateInvoice={updateInvoice}
              onDeleteInvoice={deleteInvoice}
              onExportPDF={() =>
                selectedCustomer && exportCustomerHistoryPDF(selectedCustomer)
              }
            />
          )}
          
          {view === 'invoices' && !selectedCustomer && (
             <DashboardView customers={customers} firestore={firestore} settings={settings} />
          )}


          {view === 'settings' && (
            <SettingsView
              settings={settings}
              onChange={updateSettings}
              onExport={exportSettings}
              onImport={importSettings}
            />
          )}

          {view === 'about' && <HelpView />}
        </section>
      </main>

      <footer className="max-w-7xl mx-auto px-4 pb-6 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} Tubewell Water Supply — Simple Invoice
        Management.
      </footer>
      
      {customerToDelete && (
        <CustomerDeleteDialog
          customer={customerToDelete}
          onClose={() => setCustomerToDelete(null)}
          onConfirm={() => deleteCustomer(customerToDelete.id)}
        />
      )}
    </div>
  );
}

// --- Customer Form ---
function CustomerForm({ onSubmit }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  return (
    <form
      className="mt-3 grid grid-cols-1 gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return alert('Enter customer name');
        onSubmit(name.trim(), contact.trim());
        setName('');
        setContact('');
      }}
    >
      <div>
        <Label>Customer Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Ali Khan"
        />
      </div>
      <div>
        <Label>Contact Number</Label>
        <Input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="03XX-XXXXXXX"
        />
      </div>
      <Btn className="bg-indigo-600 text-white">Add Customer</Btn>
    </form>
  );
}

// --- Dashboard View ---
function DashboardView({ customers, firestore, settings }) {
  const [stats, setStats] = useState({
    totalReceived: 0,
    totalPending: 0,
    totalCustomers: 0,
    totalInvoices: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchAllInvoices() {
      if (!firestore || !customers || customers.length === 0) {
        setStats({
          totalReceived: 0,
          totalPending: 0,
          totalCustomers: customers?.length || 0,
          totalInvoices: 0,
        });
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      let allInvoices = [];
      for (const customer of customers) {
        const invoicesColRef = collection(firestore, 'customers', customer.id, 'invoices');
        const querySnapshot = await getDocs(invoicesColRef);
        querySnapshot.forEach((doc) => {
          allInvoices.push(doc.data());
        });
      }
      
      const totalReceived = allInvoices.reduce((sum, inv) => sum + (inv.amountReceived || 0), 0);
      const totalPending = allInvoices.reduce((sum, inv) => sum + (inv.amountPending || 0), 0);
      
      setStats({
        totalReceived,
        totalPending,
        totalCustomers: customers.length,
        totalInvoices: allInvoices.length,
      });
      setIsLoading(false);
    }

    fetchAllInvoices();
  }, [customers, firestore]);

  if (isLoading) {
    return (
      <Card className="p-6 text-center">
        <p>Loading dashboard...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
       <Card className="p-6">
        <SectionTitle>Business Dashboard</SectionTitle>
         <p className="text-sm text-gray-500 mt-1">An overview of your business performance.</p>
       </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-medium text-gray-500">Total Amount Received</h3>
          <p className="mt-1 text-3xl font-semibold text-emerald-600">{formatPKR(stats.totalReceived)}</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-medium text-gray-500">Total Amount Pending</h3>
          <p className="mt-1 text-3xl font-semibold text-red-600">
            {formatPKR(stats.totalPending)}
          </p>
           <p className="text-xs text-gray-500">
            (≈ {roundAbout(stats.totalPending)})
          </p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-medium text-gray-500">Total Customers</h3>
          <p className="mt-1 text-3xl font-semibold">{stats.totalCustomers}</p>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-medium text-gray-500">Total Invoices</h3>
          <p className="mt-1 text-3xl font-semibold">{stats.totalInvoices}</p>
        </Card>
      </div>
      <Card className="p-6 grid place-content-center min-h-[40vh] text-center">
        <div>
          <h3 className="text-xl font-semibold">Select a customer</h3>
          <p className="text-sm text-gray-500 mt-2">
            Choose a customer from the left to view and create their invoices.
          </p>
        </div>
      </Card>
    </div>
  );
}


// --- Invoices View ---
function InvoicesView({
  settings,
  selectedCustomer,
  customerInvoices,
  onAddInvoice,
  onUpdateInvoice,
  onDeleteInvoice,
  onExportPDF,
}) {

  const totals = useMemo(() => {
    if (!customerInvoices) return { received: 0, pending: 0 };
    return customerInvoices.reduce(
      (acc, inv) => {
        acc.received += inv.amountReceived || 0;
        acc.pending += inv.amountPending || 0;
        return acc;
      },
      { received: 0, pending: 0 }
    );
  }, [customerInvoices]);

  if (!selectedCustomer)
    return (
      <Card className="p-6 grid place-content-center min-h-[60vh] text-center">
        <div>
          <h3 className="text-xl font-semibold">Select a customer</h3>
          <p className="text-sm text-gray-500 mt-2">
            Choose a customer from the left to view and create invoices.
          </p>
        </div>
      </Card>
    );

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold">{selectedCustomer.name}</h3>
            <p className="text-sm text-gray-500">
              {selectedCustomer.contact || 'No contact'}
            </p>
          </div>
          <div className="flex gap-2">
            <Btn className="bg-emerald-600 text-white" onClick={onExportPDF}>
              Download History PDF
            </Btn>
            <Btn
              className="border-amber-300 text-amber-700"
              onClick={() => window.print()}
            >
              Print Page
            </Btn>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle>Create New Invoice</SectionTitle>
        <InvoiceForm
          settings={settings}
          customerId={selectedCustomer.id}
          onSubmit={onAddInvoice}
        />
      </Card>

      <Card className="p-5">
        <SectionTitle>Invoices & Payments</SectionTitle>
        <div className="mt-4 overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Time</th>
                <th className="text-left p-2">Duration</th>
                <th className="text-left p-2">Rate/min</th>
                <th className="text-left p-2">Total</th>
                <th className="text-left p-2">Received</th>
                <th className="text-left p-2">Pending</th>
                <th className="text-right p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(customerInvoices || []).map((inv) => (
                <InvoiceRow
                  key={inv.id}
                  inv={inv}
                  settings={settings}
                  onUpdate={onUpdateInvoice}
                  onDelete={onDeleteInvoice}
                />
              ))}
              {(!customerInvoices || customerInvoices.length === 0) && (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-gray-500">
                    No invoices yet.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="font-bold border-t-2">
                <td colSpan={5} className="p-2 text-right">Totals:</td>
                <td className="p-2 text-emerald-600">{formatPKR(totals.received)}</td>
                <td className="p-2 text-red-600">{formatPKR(totals.pending)}</td>
                <td className="p-2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

function InvoiceForm({ settings, customerId, onSubmit }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('09:00');
  const [ratePerMinute, setRatePerMinute] = useState(settings.ratePerMinute);
  const [amountReceived, setAmountReceived] = useState(0);

  const mins = useMemo(
    () => minutesBetween(startTime, endTime),
    [startTime, endTime]
  );
  const total = useMemo(() => mins * ratePerMinute, [mins, ratePerMinute]);
  
  useEffect(() => setRatePerMinute(settings.ratePerMinute), [settings.ratePerMinute]);

  return (
    <form
      className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!customerId) return;
        const totalCost = roundAbout(total);
        const received = roundAbout(Number(amountReceived) || 0);

        onSubmit({
          customerId,
          date,
          startTime,
          endTime,
          ratePerMinute,
          durationMinutes: mins,
          totalCost: totalCost,
          amountReceived: received,
          amountPending: totalCost - received,
        });
        setAmountReceived(0);
      }}
    >
      <div>
        <Label>Date of Water Supply</Label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div>
        <Label>Supply Time (Start)</Label>
        <Input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />
      </div>
      <div>
        <Label>Supply Time (End)</Label>
        <Input
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
        />
      </div>
      <div>
        <Label>Rate per Minute (PKR)</Label>
        <Input
          type="number"
          step="0.001"
          value={ratePerMinute}
          onChange={(e) => setRatePerMinute(Number(e.target.value))}
        />
      </div>
      <div>
        <Label>Amount Received (PKR)</Label>
        <Input
          type="number"
          step="1"
          value={amountReceived}
          onChange={(e) => setAmountReceived(e.target.value as any)}
        />
      </div>
      <div className="flex flex-col justify-end">
        <div className="text-sm text-gray-600">
          Duration: <span className="font-medium">{mins} minutes</span>
        </div>
        <div className="text-sm text-gray-600">
          Total Cost:{' '}
          <span className="font-medium">{formatPKR(total)}</span>
        </div>
        <Btn className="mt-3 bg-indigo-600 text-white">Create Invoice</Btn>
      </div>
    </form>
  );
}

function InvoiceRow({ inv, settings, onUpdate, onDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const printSingleInvoice = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const html = `
      <html>
        <head>
          <title>Tubewell Water Supply Invoice</title>
          <style>
            body { font-family: ui-sans-serif, system-ui; padding: 24px; }
            .card { max-width: 700px; margin: 0 auto; border: 1px solid #e5e7eb; padding: 24px; border-radius: 16px; }
            .row { display:flex; justify-content: space-between; }
            h1 { font-size: 22px; margin: 0 0 8px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { text-align: left; padding: 8px; border-bottom: 1px solid #e5e7eb; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Tubewell Water Supply Invoice</h1>
            <div>Service Provider: ${settings.businessName}</div>
            <div>Contact: ${settings.businessContact}</div>
            <div>Address: ${settings.businessAddress}</div>
            <hr style="margin:16px 0;"/>
            <div class="row"><strong>Date:</strong> <span>${inv.date}</span></div>
            <div class="row"><strong>Time:</strong> <span>${
              inv.startTime
            } - ${inv.endTime} (${inv.durationMinutes} minutes)</span></div>
            <table>
              <thead><tr><th>Description</th><th>Rate/min</th><th>Total</th></tr></thead>
              <tbody>
                <tr>
                  <td>Water Supply (${inv.durationMinutes} minutes)</td>
                  <td>PKR ${roundAbout(inv.ratePerMinute ?? settings.ratePerMinute)}</td>
                  <td>PKR ${roundAbout(inv.totalCost)}</td>
                </tr>
              </tbody>
            </table>
            <div class="row" style="margin-top:12px;"><strong>Amount Received:</strong> <span>PKR ${roundAbout(inv.amountReceived ?? 0)}</span></div>
            <div class="row"><strong>Amount Pending:</strong> <span>PKR ${roundAbout(inv.amountPending)}</span></div>
          </div>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `;
    win.document.write(html);
    win.document.close();
  };
  
  const handleDelete = () => {
    onDelete(inv.id);
    setIsDeleteDialogOpen(false);
  };
  
  if (isEditing) {
    return <EditInvoiceForm inv={inv} settings={settings} onSave={(updates) => { onUpdate(inv.id, updates); setIsEditing(false); }} onCancel={() => setIsEditing(false)} />;
  }

  return (
    <tr className="border-b">
      <td className="p-2">{inv.date}</td>
      <td className="p-2">
        {inv.startTime} - {inv.endTime}
      </td>
      <td className="p-2">{inv.durationMinutes} min</td>
      <td className="p-2">
        {roundAbout(inv.ratePerMinute ?? settings.ratePerMinute)}
      </td>
      <td className="p-2">{roundAbout(inv.totalCost)}</td>
      <td className="p-2">{roundAbout(inv.amountReceived ?? 0)}</td>
      <td
        className={`p-2 ${
          inv.amountPending > 0 ? 'text-red-600' : 'text-emerald-600'
        }`}
      >
        {roundAbout(inv.amountPending)}
      </td>
      <td className="p-2 text-right">
        <div className="flex justify-end gap-2">
          <Btn className="text-xs" onClick={printSingleInvoice}>
            Print
          </Btn>
          <Btn
            className="text-xs"
            onClick={() => setIsEditing(true)}
          >
            Edit
          </Btn>
           <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogTrigger asChild>
              <Btn
                className="text-xs border-red-200 text-red-600"
              >
                Delete
              </Btn>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the invoice.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </td>
    </tr>
  );
}

function EditInvoiceForm({ inv, settings, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    date: inv.date,
    startTime: inv.startTime,
    endTime: inv.endTime,
    ratePerMinute: inv.ratePerMinute ?? settings.ratePerMinute,
    amountReceived: inv.amountReceived ?? 0,
  });

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'number' ? Number(value) : value }));
  };

  const handleSave = () => {
    const { date, startTime, endTime, amountReceived, ratePerMinute } = formData;
    const newMins = minutesBetween(startTime, endTime);
    if (isNaN(newMins)) {
        alert("Invalid time format.");
        return;
    }

    if (isNaN(ratePerMinute) || ratePerMinute <= 0) {
        alert("Invalid rate per minute.");
        return;
    }
    
    const newTotal = roundAbout(newMins * ratePerMinute);
    const newReceived = roundAbout(Number(amountReceived) || 0);
    const newPending = newTotal - newReceived;
    onSave({
      date,
      startTime,
      endTime,
      ratePerMinute,
      amountReceived: newReceived,
      durationMinutes: newMins,
      totalCost: newTotal,
      amountPending: newPending,
    });
  };
  
  const calculated = useMemo(() => {
    const mins = minutesBetween(formData.startTime, formData.endTime);
    const total = mins * formData.ratePerMinute;
    return { mins, total, pending: total - formData.amountReceived };
  }, [formData]);


  return (
    <tr className="bg-indigo-50">
      <td colSpan={8} className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          <div className="sm:col-span-2">
            <Label>Date</Label>
            <Input type="date" name="date" value={formData.date} onChange={handleChange} />
          </div>
          <div>
            <Label>Start Time</Label>
            <Input type="time" name="startTime" value={formData.startTime} onChange={handleChange} />
          </div>
          <div>
            <Label>End Time</Label>
            <Input type="time" name="endTime" value={formData.endTime} onChange={handleChange} />
          </div>
           <div className="sm:col-span-2">
            <Label>Info</Label>
             <div className="text-xs text-gray-600 mt-2">
                Duration: {calculated.mins} min, Total: {formatPKR(calculated.total)}
             </div>
          </div>
          <div className="sm:col-span-1">
            <Label>Rate per Minute (PKR)</Label>
            <Input type="number" step="any" name="ratePerMinute" value={formData.ratePerMinute} readOnly className="bg-gray-100" />
          </div>
           <div className="sm:col-span-2">
            <Label>Amount Received (PKR)</Label>
            <Input type="number" step="1" name="amountReceived" value={formData.amountReceived} onChange={handleChange} />
          </div>
          <div className="sm:col-span-2 flex items-end gap-2">
            <Btn className="w-full bg-indigo-600 text-white" onClick={handleSave}>Save</Btn>
            <Btn className="w-full bg-gray-200" onClick={onCancel}>Cancel</Btn>
          </div>
        </div>
      </td>
    </tr>
  );
}

// --- Settings View ---
function SettingsView({ settings, onChange, onExport, onImport }) {
  const [local, setLocal] = useState(settings);
  useEffect(() => setLocal(settings), [settings]);

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle>Settings</SectionTitle>
        <div className="flex gap-2">
          <Btn onClick={onExport}>Export Settings</Btn>
          <label className="px-3 py-2 rounded-2xl border text-sm cursor-pointer">
            Import Settings
            <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Rate Per Minute (PKR)</Label>
          <Input
            type="number"
            step="0.001"
            value={local.ratePerMinute}
            onChange={(e) =>
              setLocal({ ...local, ratePerMinute: Number(e.target.value) })
            }
          />
          <p className="text-xs text-gray-500 mt-1">
            Billing uses: Total Cost = Duration (minutes) × Rate. Default is
            16.666 PKR/min.
          </p>
        </div>
        <div>
          <Label>Business Name</Label>
          <Input
            value={local.businessName}
            onChange={(e) =>
              setLocal({ ...local, businessName: e.target.value })
            }
          />
        </div>
        <div>
          <Label>Business Contact</Label>
          <Input
            value={local.businessContact}
            onChange={(e) =>
              setLocal({ ...local, businessContact: e.target.value })
            }
          />
        </div>
        <div>
          <Label>Business Address</Label>
          <Input
            value={local.businessAddress}
            onChange={(e) =>
              setLocal({ ...local, businessAddress: e.target.value })
            }
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Btn onClick={() => setLocal(settings)}>Reset</Btn>
        <Btn
          className="bg-indigo-600 text-white"
          onClick={() => onChange(local)}
        >
          Save Changes
        </Btn>
      </div>

      <div className="pt-4 border-t">
        <SectionTitle>Notes</SectionTitle>
        <ul className="list-disc pl-5 text-sm text-gray-600 mt-2 space-y-1">
          <li>All data is now stored in a free cloud database (Firestore).</li>
          <li>You can export/import <strong>Settings</strong> as a JSON file to easily change the rate in the future.</li>
          <li>Use "Print" on a specific invoice row for a clean, printable invoice format.</li>
        </ul>
      </div>
    </Card>
  );
}

function HelpView() {
  return (
    <Card className="p-6 space-y-4">
      <SectionTitle>How to Use</SectionTitle>
      <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700">
        <li>
          <strong>Add Customer:</strong> Use the form on the left to add a new
          customer with name and contact.
        </li>
        <li>
          <strong>Create Invoice:</strong> Select a customer, enter date and
          start/end time. The app auto-calculates duration and total cost at{' '}
          <em>rate per minute</em>.
        </li>
        <li>
          <strong>Rounding:</strong> All amounts are rounded to the nearest whole number.
        </li>
        <li>
          <strong>Payments:</strong> Enter <em>Amount Received</em> to track{' '}
          <em>Amount Pending</em> = Total − Received.
        </li>
        <li>
          <strong>Manage:</strong> Edit/Delete any invoice. Edit/Delete
          customers from the list.
        </li>
        <li>
          <strong>History PDF:</strong> On a customer's page, click{' '}
          <em>Download History PDF</em> for a complete record.
        </li>
        <li>
          <strong>Settings:</strong> Change the rate, business name/contact/address. Export/Import settings via JSON.
        </li>
        <li>
          <strong>Print Invoice:</strong> Use the <em>Print</em> button on an
          invoice row to get a clean, printable invoice format titled "Tubewell
          Water Supply Invoice".
        </li>
      </ol>
    </Card>
  );
}

// --- Customer Delete Dialog ---
function CustomerDeleteDialog({ customer, onClose, onConfirm }) {
  const [confirmationText, setConfirmationText] = useState('');
  const isMatch = confirmationText === customer.name;

  return (
    <AlertDialog open={true} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Customer: {customer.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the customer and all their associated invoices.
            <br/><br/>
            To confirm, please type the customer's name: <strong>{customer.name}</strong>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={confirmationText}
          onChange={(e) => setConfirmationText(e.target.value)}
          placeholder="Type the customer name to confirm"
          className="mt-2"
        />
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={!isMatch}
            className="bg-red-600 hover:bg-red-700"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
