import { Call } from "@wailsio/runtime";

export const GreetService = {
  Greet(name: string): Promise<string> {
    return Call.ByName("GreetService.Greet", name);
  }
};
