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
  useUser,
} from '@/firebase';
import { collection, doc, getDocs, query, orderBy, limit } from 'firebase/firestore';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import {
  DollarSign,
  Users,
  Receipt,
  FileDown,
  Printer,
  Pencil,
  Trash2,
  PlusCircle,
  FileCog,
  FileUp,
  BookUser,
  LayoutDashboard,
  HelpCircle,
  Briefcase,
  LogOut
} from 'lucide-react';
import { useRouter } from 'next/navigation';


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
  return `PKR ${new Intl.NumberFormat('en-PK').format(roundAbout(num))}`;
};


const defaultSettings = {
  ratePerMinute: 16.666,
  businessName: 'Tubewell Water Supply',
  businessContact: '0300-0000000',
  businessAddress: 'Your Area, Your City',
};

// --- Main App ---
export default function App() {
  const { firestore, auth } = useFirebase();
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [view, setView] = useState('invoices'); // invoices | settings | about
  const [customerToDelete, setCustomerToDelete] = useState(null);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  // --- Firestore Data ---
  const customersRef = useMemoFirebase(
    () => (firestore && user ? collection(firestore, 'users', user.uid, 'customers') : null),
    [firestore, user]
  );
  const { data: customers = [] } = useCollection(customersRef);

  const invoicesRef = useMemoFirebase(
    () =>
      firestore && user && selectedCustomerId
        ? collection(firestore, 'users', user.uid, 'customers', selectedCustomerId, 'invoices')
        : null,
    [firestore, user, selectedCustomerId]
  );
  const { data: customerInvoices = [] } = useCollection(invoicesRef);

  const settingsRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid, 'settings', 'default') : null),
    [firestore, user]
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
    if (!customersRef) return;
    addDocumentNonBlocking(customersRef, { name, contact }).then((docRef) => {
      if(docRef) setSelectedCustomerId(docRef.id);
    });
  };

  const updateCustomer = (id, updates) => {
    if (!customersRef) return;
    const customerDoc = doc(customersRef, id);
    updateDocumentNonBlocking(customerDoc, updates);
  };

  const deleteCustomer = (id) => {
    if (!customersRef) return;
    // A more complex implementation (e.g., a cloud function) is needed to delete subcollections.
    // For now, we will just delete the customer document.
    const customerDoc = doc(customersRef, id);
    deleteDocumentNonBlocking(customerDoc);
    if (selectedCustomerId === id) setSelectedCustomerId(null);
    setCustomerToDelete(null);
  };


  // Actions: Invoices
  const addInvoice = (payload) => {
    if (!invoicesRef) return;
    addDocumentNonBlocking(invoicesRef, {
      ...payload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  const updateInvoice = (id, updates) => {
    if (!invoicesRef) return;
    const invoiceDoc = doc(invoicesRef, id);
    updateDocumentNonBlocking(invoiceDoc, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  };

  const deleteInvoice = (id) => {
    if (!invoicesRef) return;
    const invoiceDoc = doc(invoicesRef, id);
    deleteDocumentNonBlocking(invoiceDoc);
  };

  const updateSettings = (newSettings) => {
    if (!settingsRef) return;
    setDocumentNonBlocking(settingsRef, newSettings, { merge: true });
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
      headStyles: { fillColor: [37, 99, 235] },
      theme: 'striped',
    });

    doc.save(`${customer.name.replace(/\s+/g, '_')}_invoice_history.pdf`);
  };
  
  const handleViewAllCustomers = () => {
    setSelectedCustomerId(null);
    setView('invoices');
  };

  const handleSignOut = () => {
    if(auth) {
      auth.signOut();
    }
  }

  if (isUserLoading || !user) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b">
        <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
             <Briefcase className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                AquaBill
              </h1>
              <p className="text-xs text-gray-500">
                Simple Water Supply Invoicing
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
           <Button
              variant={!selectedCustomerId && view === 'invoices' ? 'default' : 'ghost'}
              size="sm"
              onClick={handleViewAllCustomers}
              className="inline-flex items-center gap-2"
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Button>
            <Button
              variant={view === 'settings' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setView('settings')}
              className="inline-flex items-center gap-2"
            >
              <FileCog className="h-4 w-4" />
              Settings
            </Button>
            <Button
              variant={view === 'about' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setView('about')}
               className="inline-flex items-center gap-2"
            >
              <HelpCircle className="h-4 w-4" />
              Help
            </Button>
            <Button
              variant='ghost'
              size="sm"
              onClick={handleSignOut}
              className="inline-flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-[380px,1fr] gap-6">
        {/* Sidebar */}
        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Customers</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="Search by name or number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="mt-3 space-y-2 max-h-[calc(100vh-420px)] overflow-auto pr-1">
                {(filteredCustomers || []).map((c) => (
                  <div
                    key={c.id}
                    className={`p-3 rounded-lg border flex items-center justify-between gap-3 transition-colors ${
                      selectedCustomerId === c.id
                        ? 'bg-primary/10 border-primary'
                        : 'bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800'
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
                      <div className="text-xs text-muted-foreground">
                        {c.contact || 'No contact'}
                      </div>
                    </button>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const name = prompt('Customer name', c.name);
                          if (!name) return;
                          const contact = prompt('Contact number', c.contact || '');
                          updateCustomer(c.id, { name, contact });
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setCustomerToDelete(c)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {filteredCustomers && filteredCustomers.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No customers found.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PlusCircle className="h-5 w-5" /> Add Customer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CustomerForm onSubmit={addCustomer} />
            </CardContent>
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
             <DashboardView customers={customers} firestore={firestore} settings={settings} user={user} />
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

      <footer className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8 pb-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} AquaBill — Simple Water Supply Invoicing.
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
      className="grid grid-cols-1 gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return alert('Enter customer name');
        onSubmit(name.trim(), contact.trim());
        setName('');
        setContact('');
      }}
    >
      <div className="space-y-2">
        <Label>Customer Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Ali Khan"
        />
      </div>
      <div className="space-y-2">
        <Label>Contact Number</Label>
        <Input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="03XX-XXXXXXX"
        />
      </div>
      <Button type="submit" className="w-full">
        <PlusCircle className="mr-2 h-4 w-4" />
        Add Customer
      </Button>
    </form>
  );
}

// --- Dashboard View ---
function DashboardView({ customers, firestore, settings, user }) {
  const [stats, setStats] = useState({
    totalReceived: 0,
    totalPending: 0,
    totalCustomers: 0,
    totalInvoices: 0,
  });
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!firestore || !user) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      
      // Fetch all invoices for stats
      let allInvoices = [];
      for (const customer of (customers || [])) {
        const invoicesColRef = collection(firestore, 'users', user.uid, 'customers', customer.id, 'invoices');
        const querySnapshot = await getDocs(invoicesColRef);
        querySnapshot.forEach((doc) => {
          allInvoices.push({ ...doc.data(), customerName: customer.name });
        });
      }
      
      const totalReceived = allInvoices.reduce((sum, inv) => sum + (inv.amountReceived || 0), 0);
      const totalPending = allInvoices.reduce((sum, inv) => sum + (inv.amountPending || 0), 0);
      
      setStats({
        totalReceived,
        totalPending,
        totalCustomers: customers?.length || 0,
        totalInvoices: allInvoices.length,
      });

      // Fetch recent 5 invoices
      allInvoices.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRecentInvoices(allInvoices.slice(0, 5));

      setIsLoading(false);
    }

    fetchData();
  }, [customers, firestore, user]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Business Dashboard</CardTitle>
            <CardDescription>An overview of your business performance.</CardDescription>
          </CardHeader>
        </Card>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card><CardHeader><div className="h-16"></div></CardHeader></Card>
          <Card><CardHeader><div className="h-16"></div></CardHeader></Card>
          <Card><CardHeader><div className="h-16"></div></CardHeader></Card>
          <Card><CardHeader><div className="h-16"></div></CardHeader></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
       <Card>
        <CardHeader>
          <CardTitle>Business Dashboard</CardTitle>
          <CardDescription>An overview of your business performance.</CardDescription>
        </CardHeader>
       </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Received</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{formatPKR(stats.totalReceived)}</div>
            <p className="text-xs text-muted-foreground">Across all invoices</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pending</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatPKR(stats.totalPending)}</div>
            <p className="text-xs text-muted-foreground">
              (Rounded: {formatPKR(roundAbout(stats.totalPending))})
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCustomers}</div>
             <p className="text-xs text-muted-foreground">Active customers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Invoices</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalInvoices}</div>
            <p className="text-xs text-muted-foreground">Generated so far</p>
          </CardContent>
        </Card>
      </div>

       <Card>
          <CardHeader>
            <CardTitle>Recent Invoices</CardTitle>
            <CardDescription>The last 5 invoices created across all customers.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead className="text-right">Amount Pending</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentInvoices.length > 0 ? recentInvoices.map((inv, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{inv.customerName}</TableCell>
                    <TableCell>{inv.date}</TableCell>
                    <TableCell className="text-right">{formatPKR(inv.totalCost)}</TableCell>
                    <TableCell className={`text-right font-medium ${inv.amountPending > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {formatPKR(inv.amountPending)}
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      No recent invoices.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
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
    return (customerInvoices || []).reduce(
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
          <p className="text-sm text-muted-foreground mt-2">
            Choose a customer from the left to view and create invoices.
          </p>
        </div>
      </Card>
    );

  return (
    <div className="space-y-6">
      <Card>
       <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><BookUser className="h-6 w-6"/>{selectedCustomer.name}</CardTitle>
            <CardDescription className="mt-1">
              {selectedCustomer.contact || 'No contact'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onExportPDF}>
              <FileDown className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print Page
            </Button>
          </div>
        </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><PlusCircle className="h-5 w-5" />Create New Invoice</CardTitle>
        </CardHeader>
        <CardContent>
          <InvoiceForm
            settings={settings}
            customerId={selectedCustomer.id}
            onSubmit={onAddInvoice}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" />Invoices & Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Rate/min</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Pending</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
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
                <TableRow>
                  <TableCell colSpan={8} className="p-4 text-center text-muted-foreground">
                    No invoices yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter>
              <TableRow className="font-bold text-base">
                <TableCell colSpan={5} className="p-2 text-right">Totals:</TableCell>
                <TableCell className="p-2 text-emerald-600">{formatPKR(totals.received)}</TableCell>
                <TableCell className="p-2 text-red-600">{formatPKR(totals.pending)}</TableCell>
                <TableCell className="p-2"></TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
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
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end"
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
      <div className="space-y-2">
        <Label>Date of Water Supply</Label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Supply Time (Start)</Label>
        <Input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Supply Time (End)</Label>
        <Input
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Rate per Minute (PKR)</Label>
        <Input
          type="number"
          step="0.01"
          value={ratePerMinute}
          onChange={(e) => setRatePerMinute(Number(e.target.value))}
        />
      </div>
      <div className="space-y-2">
        <Label>Amount Received (PKR)</Label>
        <Input
          type="number"
          step="1"
          value={amountReceived}
          onChange={(e) => setAmountReceived(e.target.value as any)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-sm text-muted-foreground space-y-1 p-2 rounded-md border bg-gray-50 dark:bg-gray-800">
          <div>Duration: <span className="font-medium">{mins} minutes</span></div>
          <div>Total Cost: <span className="font-medium">{formatPKR(total)}</span></div>
        </div>
        <Button type="submit" className="w-full">
            <PlusCircle className="mr-2 h-4 w-4" />
            Create Invoice
        </Button>
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
    <TableRow>
      <TableCell>{inv.date}</TableCell>
      <TableCell>
        {inv.startTime} - {inv.endTime}
      </TableCell>
      <TableCell>{inv.durationMinutes} min</TableCell>
      <TableCell>
        {roundAbout(inv.ratePerMinute ?? settings.ratePerMinute)}
      </TableCell>
      <TableCell>{formatPKR(inv.totalCost)}</TableCell>
      <TableCell>{formatPKR(inv.amountReceived ?? 0)}</TableCell>
      <TableCell
        className={`font-medium ${
          inv.amountPending > 0 ? 'text-red-600' : 'text-emerald-600'
        }`}
      >
        {formatPKR(inv.amountPending)}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={printSingleInvoice}><Printer className="h-4 w-4" /></Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsEditing(true)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
           <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
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
                <AlertDialogAction onClick={handleDelete} asChild><Button variant="destructive">Delete</Button></AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
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
    <TableRow className="bg-blue-50/50 dark:bg-blue-900/10">
      <TableCell colSpan={8} className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-end">
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" name="date" value={formData.date} onChange={handleChange} />
          </div>
          <div className="space-y-2">
            <Label>Start Time</Label>
            <Input type="time" name="startTime" value={formData.startTime} onChange={handleChange} />
          </div>
          <div className="space-y-2">
            <Label>End Time</Label>
            <Input type="time" name="endTime" value={formData.endTime} onChange={handleChange} />
          </div>
          <div className="space-y-2">
            <Label>Rate per Minute</Label>
            <Input type="number" name="ratePerMinute" value={formData.ratePerMinute} readOnly className="bg-gray-100 dark:bg-gray-800" />
          </div>
           <div className="space-y-2">
            <Label>Amount Received</Label>
            <Input type="number" step="1" name="amountReceived" value={formData.amountReceived} onChange={handleChange} />
          </div>
          
          <div className="sm:col-span-3 text-xs text-muted-foreground p-2 rounded-md border bg-gray-50 dark:bg-gray-800 space-y-1">
            <div>Duration: <span className="font-medium">{calculated.mins} min</span></div>
            <div>Total Cost: <span className="font-medium">{formatPKR(calculated.total)}</span></div>
            <div>Pending: <span className="font-medium">{formatPKR(calculated.pending)}</span></div>
          </div>
          <div className="sm:col-span-2 flex items-end gap-2">
            <Button className="w-full" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button className="w-full" onClick={handleSave}>Save Changes</Button>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

// --- Settings View ---
function SettingsView({ settings, onChange, onExport, onImport }) {
  const [local, setLocal] = useState(settings);
  useEffect(() => setLocal(settings), [settings]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileCog className="h-5 w-5" />Settings</CardTitle>
        <CardDescription>Manage your business information and default rates.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Rate Per Minute (PKR)</Label>
            <Input
              type="number"
              step="0.01"
              value={local.ratePerMinute}
              onChange={(e) =>
                setLocal({ ...local, ratePerMinute: Number(e.target.value) })
              }
            />
            <p className="text-xs text-muted-foreground">
              Default billing rate. E.g., 1000 PKR/hour is 16.67 PKR/min.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Business Name</Label>
            <Input
              value={local.businessName}
              onChange={(e) =>
                setLocal({ ...local, businessName: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Business Contact</Label>
            <Input
              value={local.businessContact}
              onChange={(e) =>
                setLocal({ ...local, businessContact: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Business Address</Label>
            <Input
              value={local.businessAddress}
              onChange={(e) =>
                setLocal({ ...local, businessAddress: e.target.value })
              }
            />
          </div>
        </div>
        <div className="pt-4 border-t">
            <h3 className="font-semibold tracking-tight">Notes</h3>
            <ul className="list-disc pl-5 text-sm text-muted-foreground mt-2 space-y-1">
              <li>All data is stored in a free cloud database (Firestore).</li>
              <li>You can export/import <strong>Settings</strong> as a JSON file to easily change the rate in the future.</li>
              <li>Use "Print" on a specific invoice row for a clean, printable invoice format.</li>
            </ul>
        </div>
      </CardContent>
      <CardFooter className="justify-between border-t pt-6">
        <div className="flex gap-2">
          <Button variant="outline" onClick={onExport}><FileDown className="mr-2 h-4 w-4" />Export Settings</Button>
          <Button variant="outline" asChild>
            <label>
              <FileUp className="mr-2 h-4 w-4" /> Import Settings
              <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
            </label>
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setLocal(settings)}>Reset</Button>
          <Button onClick={() => onChange(local)}>
            Save Changes
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

function HelpView() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><HelpCircle className="h-5 w-5" />How to Use</CardTitle>
      </CardHeader>
      <CardContent>
      <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
        <li>
          <strong>Add Customer:</strong> Use the form on the left to add a new
          customer with name and contact.
        </li>
        <li>
          <strong>Create Invoice:</strong> Select a customer, enter date and
          start/end time. The app auto-calculates duration and total cost at the specified{' '}
          <em>rate per minute</em>.
        </li>
        <li>
          <strong>Rounding:</strong> All amounts are rounded to the nearest whole number for simplicity.
        </li>
        <li>
          <strong>Payments:</strong> Enter <em>Amount Received</em> when creating or editing an invoice to track the remaining{' '}
          <em>Amount Pending</em>.
        </li>
        <li>
          <strong>Manage:</strong> Edit/Delete any invoice in real-time. Edit/Delete
          customers from the list on the left.
        </li>
        <li>
          <strong>History PDF:</strong> Once a customer is selected, click{' '}
          <em>Download PDF</em> for a complete, printable record of their invoices.
        </li>
        <li>
          <strong>Settings:</strong> Change the default rate, business name, contact, and address. Export/Import settings via JSON for backup or transfer.
        </li>
        <li>
          <strong>Print Invoice:</strong> Use the <em>Print</em> button on an
          invoice row to get a clean, printable invoice format.
        </li>
      </ol>
      </CardContent>
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
            asChild
          >
            <Button variant="destructive">Delete Customer</Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
