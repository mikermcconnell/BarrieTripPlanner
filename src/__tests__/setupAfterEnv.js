global.IS_REACT_ACT_ENVIRONMENT = true;

let consoleErrorSpy;

beforeAll(() => {
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
    const [firstArg] = args;
    if (
      typeof firstArg === 'string' &&
      firstArg.includes('react-test-renderer is deprecated')
    ) {
      return;
    }
    jest.requireActual('console').error(...args);
  });
});

afterAll(() => {
  consoleErrorSpy?.mockRestore();
});
