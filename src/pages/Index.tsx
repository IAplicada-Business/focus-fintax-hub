import { useEffect, useRef } from "react";

const Index = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/lp.html")
      .then((res) => res.text())
      .then((html) => {
        if (!containerRef.current) return;

        // Parse the HTML to extract body content, styles, and scripts
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        // Extract and inject styles
        const styles = doc.querySelectorAll("style");
        styles.forEach((style) => {
          const newStyle = document.createElement("style");
          newStyle.textContent = style.textContent;
          document.head.appendChild(newStyle);
        });

        // Extract and inject link tags (fonts)
        const links = doc.querySelectorAll('link[rel="stylesheet"]');
        links.forEach((link) => {
          const newLink = document.createElement("link");
          newLink.rel = "stylesheet";
          newLink.href = (link as HTMLLinkElement).href;
          document.head.appendChild(newLink);
        });

        // Inject body content
        containerRef.current.innerHTML = doc.body.innerHTML;

        // Config do projeto atual — a LP é HTML estático e não lê import.meta.env
        (window as unknown as { __FT_SUPABASE__?: { url: string; anonKey: string } }).__FT_SUPABASE__ = {
          url: import.meta.env.VITE_SUPABASE_URL,
          anonKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        };

        // Extract and execute scripts
        const scripts = doc.querySelectorAll("script");
        scripts.forEach((script) => {
          const newScript = document.createElement("script");
          if (script.src) {
            newScript.src = script.src;
          } else {
            newScript.textContent = script.textContent;
          }
          document.body.appendChild(newScript);
        });
      });

    // Cleanup on unmount
    return () => {
      // Remove injected styles
      document.querySelectorAll("style").forEach((style) => {
        if (style.textContent?.includes("--navy:#0a1a6b")) {
          style.remove();
        }
      });
    };
  }, []);

  return <div ref={containerRef} />;
};

export default Index;
