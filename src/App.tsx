import { Toaster } from "react-hot-toast";
import WordleClone from "./components/Worlde";

function App() {
  return (
    <main>
      <WordleClone />;
      <Toaster
        position="top-center"
        gutter={12}
        containerStyle={{ margin: "8px" }}
        toastOptions={{
          success: {
            duration: 3000,
          },
          error: {
            duration: 3000,
          },
          style: {
            fontSize: "16px",
            maxWidth: "500px",
            padding: "16px 24px",
            // backgroundColor: 'var(--color-grey-0)',
            backgroundColor: "white",
            zIndex: "500",
            // color: "var(--color-grey-700)",
          },
        }}
      />
    </main>
  );
}

export default App;
