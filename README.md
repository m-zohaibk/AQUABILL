# AquaBill - Simple Water Supply Invoicing

AquaBill is a modern, real-time invoicing application designed for small-scale water supply businesses. Built with Next.js and Firebase, it provides a simple yet powerful interface to manage customers, create invoices, and track payments seamlessly. All your data is stored securely in the cloud and is accessible only to you.

[![Live Preview](https://img.shields.io/badge/Live-Preview-blue?style=for-the-badge&logo=vercel)](https://aquabill-wheat.vercel.app/)

---

## Key Features

*   **Secure Authentication**: Each user has their own private account. Data is isolated and protected using Firebase Authentication, ensuring only you can access your information.
*   **Customer Management**: Easily add, edit, search for, and delete customers.
*   **Real-Time Invoicing**: Create, update, and delete invoices with real-time updates to the database. The interface instantly reflects any changes.
*   **Dynamic Calculations**: The app automatically calculates the duration of water supply and the total cost based on your configured rate.
*   **Payment Tracking**: Keep track of payments by logging the amount received for each invoice. The app automatically calculates the pending balance.
*   **Business Dashboard**: Get a quick overview of your business with key stats like total revenue, pending amounts, and total customers. It also shows a list of the 5 most recent invoices.
*   **PDF & Print**: Download a complete invoice history for any customer as a PDF or print individual invoices with a clean, professional format.
*   **Customizable Settings**: Set your own default billing rate (per minute) and business details, which appear on printed invoices.
*   **Data Portability**: Export and import your application settings as a JSON file for easy backup and transfer.
*   **Responsive Design**: A clean, modern, and fully responsive interface that works beautifully on both desktop and mobile devices.

## Authentication

AquaBill uses email and password for authentication. When registering a new account, please ensure your **password is at least 6 characters long**.

## Getting Started

To run this project locally, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:9002`.

## Tech Stack

*   **Framework**: [Next.js](https://nextjs.org/) (App Router)
*   **Database & Auth**: [Firebase](https://firebase.google.com/) (Firestore & Authentication)
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
*   **UI Components**: [ShadCN UI](https://ui.shadcn.com/)
*   **PDF Generation**: [jsPDF](https://github.com/parallax/jsPDF) & [jspdf-autotable](https://github.com/simonbengtsson/jsPDF-AutoTable)
*   **Deployment**: Vercel (or any Next.js compatible hosting)
