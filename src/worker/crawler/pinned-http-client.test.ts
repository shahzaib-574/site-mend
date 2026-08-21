import { Socket } from "node:net";

import { describe, expect, it, vi } from "vitest";

import { createPinnedConnector } from "./pinned-http-client";

function connectedSocket(remoteAddress: string): Socket {
  const socket = new Socket();
  Object.defineProperty(socket, "remoteAddress", { value: remoteAddress });
  return socket;
}

const connectOptions = {
  hostname: "example.com",
  host: "example.com",
  port: "443",
  protocol: "https:",
};

describe("createPinnedConnector", () => {
  it("connects to the admitted IP while preserving hostname TLS validation", async () => {
    let receivedOptions: typeof connectOptions | undefined;
    const baseConnector = vi.fn((options, callback) => {
      receivedOptions = options;
      callback(null, connectedSocket("93.184.216.34"));
    });
    const connector = createPinnedConnector(
      "example.com",
      { address: "93.184.216.34", family: 4 },
      baseConnector,
    );

    await new Promise<void>((resolve, reject) => {
      connector(connectOptions, (error, socket) => {
        void socket;
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    expect(receivedOptions).toEqual(
      expect.objectContaining({
        host: "example.com",
        hostname: "93.184.216.34",
        servername: "example.com",
      }),
    );
  });

  it.each(["10.0.0.8", "93.184.216.35"])(
    "rejects an unexpected connected address (%s)",
    async (remoteAddress) => {
      const socket = connectedSocket(remoteAddress);
      const destroy = vi.spyOn(socket, "destroy");
      const connector = createPinnedConnector(
        "example.com",
        { address: "93.184.216.34", family: 4 },
        (_options, callback) => callback(null, socket),
      );

      const error = await new Promise<Error | null>((resolve) => {
        connector(connectOptions, (connectorError, socket) => {
          void socket;
          resolve(connectorError);
        });
      });

      expect(error).toMatchObject({ code: "SOCKET_MISMATCH" });
      expect(destroy).toHaveBeenCalled();
    },
  );

  it("rejects a connector request for a different hostname", async () => {
    const baseConnector = vi.fn();
    const connector = createPinnedConnector(
      "example.com",
      { address: "93.184.216.34", family: 4 },
      baseConnector,
    );

    const error = await new Promise<Error | null>((resolve) => {
      connector(
        { ...connectOptions, hostname: "internal.example" },
        (connectorError, socket) => {
          void socket;
          resolve(connectorError);
        },
      );
    });

    expect(error).toMatchObject({ code: "SOCKET_MISMATCH" });
    expect(baseConnector).not.toHaveBeenCalled();
  });
});
