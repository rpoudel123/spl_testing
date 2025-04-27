// Declarations for Mocha globals
declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: (done?: any) => any): void;
declare function before(fn: (done?: any) => any): void;
declare function beforeEach(fn: (done?: any) => any): void;
declare function after(fn: (done?: any) => any): void;
declare function afterEach(fn: (done?: any) => any): void; 