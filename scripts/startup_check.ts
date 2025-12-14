
import './setup';
console.log("Attempting to import engine...");
try {
    await import('../src/engine.js');
    console.log("Successfully imported engine.");
} catch (e) {
    console.error("CRASH IMPORTING ENGINE:");
    console.error(e);
}


