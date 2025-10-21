import { FirebaseClientProvider } from "@/firebase";

export default function AuthLayout({
    children,
  }: {
    children: React.ReactNode
  }) {
    return (
        <FirebaseClientProvider>
            {children}
        </FirebaseClientProvider>
    )
  }