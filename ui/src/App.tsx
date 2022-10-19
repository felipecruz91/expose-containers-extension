import React, { useEffect, useState } from "react";
import { createDockerDesktopClient } from "@docker/extension-api-client";
import { Stack, TextField, Typography, Button } from "@mui/material";

// Container
export interface Container {
  Names: string[];
  Ports: Port[];
}

export interface Port {
  PublicPort: number;
  Type: string;
}

// Note: This line relies on Docker Desktop's presence as a host application.
// If you're running this React app in a browser, it won't work properly.
const client = createDockerDesktopClient();

function useDockerDesktopClient() {
  return client;
}

export function App() {
  const [containers, setContainers] = useState<Container[]>();
  const [authToken, setAuthToken] = useState<string>();
  const [url, setUrl] = useState<string>("-");
  const ddClient = useDockerDesktopClient();

  // List containers when entering the extension
  useEffect(() => {
    listContainers();
  }, []);

  // Refresh list of containers when a new container is started or destroyed.
  // See all the events here: https://docs.docker.com/engine/reference/commandline/events/
  useEffect(() => {
    const containersEvents = async () => {
      await ddClient.docker.cli.exec(
        "events",
        [
          "--format",
          `"{{ json . }}"`,
          "--filter",
          "type=container",
          "--filter",
          "event=start",
          "--filter",
          "event=destroy",
        ],
        {
          stream: {
            async onOutput() {
              listContainers();
            },
            onClose(exitCode) {
              console.log("onClose with exit code " + exitCode);
            },
            splitOutputLines: true,
          },
        }
      );
    };

    containersEvents();
  }, []);

  const listContainers = () => {
    ddClient.docker
      .listContainers()
      .then((value: Container[]) => {
        console.log(value);
        setContainers(value);
      })
      .catch((err: Error) => {
        console.log(err);
      });
  };

  const handleAuthTokenChange = (event) => {
    setAuthToken(event.target.value);
  };

  const DisplayContainerPorts = (container: Container) => {
    let publishedPorts: string[] = [];

    for (var i = 0; i < container.Ports.length; i++) {
      let type = container.Ports[i].Type.toUpperCase();
      let port = container.Ports[i].PublicPort ?? "-";
      let publishedPort = "(" + type + ")" + " " + port;
      publishedPorts.push(publishedPort);
    }

    return (
      <td key={"ports-" + container.Names[0]}>
        {publishedPorts.length > 0 ? (
          publishedPorts.map((p) => <pre>{p}</pre>)
        ) : (
          <pre>-</pre>
        )}
      </td>
    );
  };

  const PrintTableHeaders = () => {
    return (
      <tr key="headers">
        {["Container", "Published ports", "URL"].map((h) => (
          <td key={h}>{h}</td>
        ))}
      </tr>
    );
  };

  // Make the container accessible from the internet
  // by running an ngrok container that targets the app's container port:
  // e.g. "docker run -e NGROK_AUTHTOKEN=***** --net=host ngrok/ngrok http 8080 --log stdout --log-format json"
  const exposeHandle = async (port: number) => {
    await ddClient.docker.cli.exec("run", [
      "--name=foo",
      "-e",
      `NGROK_AUTHTOKEN=${authToken}`,
      "--net=host",
      "-d",
      "ngrok/ngrok",
      "http",
      port.toString(),
      "--log=stdout",
      "--log-format=json",
    ]);

    const interval = setInterval(async () => {
      const logsOutput = await ddClient.docker.cli.exec("logs", ["foo"]);
      console.log(logsOutput);

      const lines = logsOutput.parseJsonLines();

      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];

        if (line.msg === "started tunnel") {
          console.log("URL: ", line.url);
          setUrl(line.url);
          clearInterval(interval);
        }
      }
    }, 1000);
  };

  const PrintTableRows = () => {
    if (containers === undefined) {
      return;
    }

    return (
      containers &&
      containers
        .filter(
          (c: Container) => c.Ports.filter((p) => p.PublicPort).length > 0
        ) // only display containers that expose ports
        .map((container) => (
          <React.Fragment>
            <tr key={"ctr-row-" + container.Names[0]}>
              <td key={"ctr-name-" + container.Names[0]}>
                {container.Names[0].substring(1)}
              </td>

              {DisplayContainerPorts(container)}

              <td key={"urls-" + container.Names[0]}>
                <pre>{url}</pre>
              </td>

              {url === "-" && (
                <Button
                  variant="contained"
                  onClick={async () =>
                    exposeHandle(container.Ports[0].PublicPort)
                  } // TODO: if many, select the port to expose
                >
                  Expose
                </Button>
              )}
            </tr>
          </React.Fragment>
        ))
    );
  };

  return (
    <>
      <Typography variant="h3">Docker extension demo</Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
        This is a basic page rendered with MUI, using Docker's theme. Read the
        MUI documentation to learn more. Using MUI in a conventional way and
        avoiding custom styling will help make sure your extension continues to
        look great as Docker's theme evolves.
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
        Pressing the below button will trigger a request to the backend. Its
        response will appear in the textarea.
      </Typography>
      <Stack direction="column" alignItems="start" spacing={2} sx={{ mt: 4 }}>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
          The ngrok auth token is not stored.
        </Typography>
        <TextField
          sx={{ width: 480 }}
          variant="outlined"
          // type="password"
          minRows={5}
          onChange={handleAuthTokenChange}
          value={authToken}
        />

        <div>
          <table style={{ width: "100%" }}>
            <thead>
              {PrintTableHeaders()}
              {PrintTableRows()}
            </thead>
          </table>
        </div>
      </Stack>
    </>
  );
}
