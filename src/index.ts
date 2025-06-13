import { parse } from "csv-parse/sync";
import { Octokit } from "@octokit/rest";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { warn } from "console";

interface Config {
  github: {
    token: string;
    owner: string;
    repo: string;
    issueTemplate?: string;
  };
  fieldMapping: {
    [notionField: string]: {
      githubField: "title" | "label" | "body";
      delimiter?: string;
    };
  };
  retry: {
    maxAttempts: number;
    delayMs: number;
  };
}

const defaultConfig: Config = {
  github: {
    token: process.env.GITHUB_TOKEN || "",
    owner: "your-github-username",
    repo: "your-github-repo",
    issueTemplate: undefined,
  },
  fieldMapping: {
    Name: { githubField: "title" },
    Tag: { githubField: "label", delimiter: ", " },
    Priority: { githubField: "label", delimiter: ", " },
  },
  retry: {
    maxAttempts: 3,
    delayMs: 1000,
  },
};

function generateLabelColor(labelName: string): string {
  const hash = crypto.createHash("md5").update(labelName).digest("hex");
  return `#${hash.slice(0, 6)}`;
}

function loadConfig(configPath?: string): Config {
  if (configPath && fs.existsSync(configPath)) {
    const configFile = fs.readFileSync(configPath, "utf-8");
    return { ...defaultConfig, ...JSON.parse(configFile) };
  }
  return defaultConfig;
}

async function getIssueTemplate(
  octokit: Octokit,
  owner: string,
  repo: string,
  templateName?: string,
): Promise<string> {
  try {
    const { data: contents } = await octokit.repos.getContent({
      owner,
      repo,
      path: ".github/ISSUE_TEMPLATE",
    });

    if (Array.isArray(contents)) {
      let templateContent = "";

      if (templateName) {
        // 指定されたテンプレートを探す
        const template = contents.find(
          (file) =>
            file.name === templateName ||
            file.name === `${templateName}.md` ||
            file.name === `${templateName}.yml` ||
            file.name === `${templateName}.yaml`,
        );

        if (template && template.type === "file") {
          const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: template.path,
          });

          if ("content" in data) {
            templateContent = Buffer.from(data.content, "base64").toString(
              "utf8",
            );
          }
        }
      } else if (contents.length > 0) {
        // テンプレート名が指定されていない場合は最初のものを使用
        const firstTemplate = contents[0];
        if (firstTemplate.type === "file") {
          const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: firstTemplate.path,
          });

          if ("content" in data) {
            templateContent = Buffer.from(data.content, "base64").toString(
              "utf8",
            );
          }
        }
      }

      return templateContent;
    }
  } catch (error) {
    console.log("Issue template not found, using empty template");
  }

  return "";
}

async function ensureLabel(
  octokit: Octokit,
  owner: string,
  repo: string,
  labelName: string,
): Promise<void> {
  try {
    await octokit.issues.getLabel({
      owner,
      repo,
      name: labelName,
    });
  } catch (error: any) {
    if (error.status === 404) {
      await octokit.issues.createLabel({
        owner,
        repo,
        name: labelName,
        color: generateLabelColor(labelName),
      });
    } else {
      throw error;
    }
  }
}

async function createIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  title: string,
  body: string,
  labels: string[],
  retryConfig: Config["retry"],
): Promise<void> {
  let attempts = 0;

  while (attempts < retryConfig.maxAttempts) {
    try {
      await octokit.issues.create({
        owner,
        repo,
        title,
        body,
        labels,
      });
      console.log(`Issue created: ${title}`);
      return;
    } catch (error: any) {
      if (error.status === 422) {
        console.error(`Issue creation failed: ${error.message}`);
        return;
      }
      attempts++;
      console.error(`Attempt ${attempts} failed: ${error.message}`);
      if (attempts < retryConfig.maxAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, retryConfig.delayMs),
        );
      }
    }
  }
  console.error(
    `Failed to create issue after ${retryConfig.maxAttempts} attempts.`,
  );
}

export async function migrateNotionToGitHub(
  csvFilePath: string,
  configPath?: string,
): Promise<void> {
  const config = loadConfig(configPath);
  const octokit = new Octokit({ auth: config.github.token });
  const csvContent = fs.readFileSync(csvFilePath, "utf-8");
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  });
  const issueTemplate = await getIssueTemplate(
    octokit,
    config.github.owner,
    config.github.repo,
    config.github.issueTemplate,
  );
  for (const record of records) {
    let title = "";
    let body = issueTemplate || "";
    const labels: Set<string> = new Set();
    for (const [notionField, mapping] of Object.entries(config.fieldMapping)) {
      const value = record[notionField];
      if (!value) continue;

      switch (mapping.githubField) {
        case "title":
          title = value;
          break;
        case "label":
          const labelValues = value
            .split(mapping.delimiter || ",")
            .map((v: string) => v.trim())
            .fileter(Boolean);
          for (const labelValue of labelValues) {
            labels.add(labelValue);
          }
          break;
        case "body":
          body = body ? `${body}\n\n${value}` : value;
          break;
      }
    }

    if (!title) {
      console.warn(
        `No title found for record, skipping: ${JSON.stringify(record)}`,
      );
      continue;
    }

    const labelsArray = Array.from(labels);
    for (const label of labelsArray) {
      await ensureLabel(
        octokit,
        config.github.owner,
        config.github.repo,
        label,
      );
    }

    await createIssue(
      octokit,
      config.github.owner,
      config.github.repo,
      title,
      body,
      labelsArray,
      config.retry,
    );
  }
  console.log("Migration completed successfully.");
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: node index.js <csv-file-path> [config-file-path]");
    process.exit(1);
  }

  const csvFilePath = args[0];
  const configPath = args[1];

  migrateNotionToGitHub(csvFilePath, configPath).catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
}
