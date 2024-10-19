/* 

// contains 3 operations 
// 1. scale up karpenter controller nodegroup 
// 2. create all nodepools
// 3. send slack notification that cluster scaled up 
 */
// Import the necessary AWS SDK client
const https = require('https');
const { URL } = require('url');
const { AutoScalingClient, DescribeAutoScalingGroupsCommand, UpdateAutoScalingGroupCommand } = require("@aws-sdk/client-auto-scaling");

function sendSlackNotification(webhook_url, message) {
    const payload = JSON.stringify({ text: message });
    const url = new URL(webhook_url);

    const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
        },
    };

    const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
            responseData += chunk;
        });

        res.on('end', () => {
            if (res.statusCode === 200) {
                console.log("Slack notification sent successfully!");
            } else {
                console.error(`Failed to send Slack notification. Status code: ${res.statusCode}, Response: ${responseData}`);
            }
        });
    });

    req.on('error', (e) => {
        console.error(`Problem with request: ${e.message}`);
    });

    // Send the payload
    req.write(payload);
    req.end();
}

// Create an AutoScaling client
const autoscalingClient = new AutoScalingClient({ region: 'eu-west-1' }); // Specify your region

// Function to scale up an Auto Scaling Group (ASG) to zero
const scaleUp = async (asgName) => {
    try {
        // Step 1: Update the ASG with desired capacity set to 1
        const updateCommand = new UpdateAutoScalingGroupCommand({
            AutoScalingGroupName: asgName,
            DesiredCapacity: 1,
            MinSize: 1,
            MaxSize: 1
        });
        await autoscalingClient.send(updateCommand);

        console.log(`Successfully scaled up ASG ${asgName} to Desired Capacity: 1`);
    } catch (error) {
        console.error('Error scaling up ASG:', error);
    }
};

/* aws lambda handler */
exports.handler = function(event, context) {
// function handler (event, context){
    // const params = event.params;
    // const command = event.command;
    // let stdin = event.stdin;
    // if (typeof(stdin) === "object") {
    //     stdin = JSON.stringify(stdin);
    // }
    // params.push('--output');
    // params.push('json');
    // params.push('--kubeconfig');
    // params.push('config');
    /* use spawn */
    // step 1. scale up karpenter controller nodegroup 
// Example usage: Scale up the ASG named 'my-auto-scaling-group' to 0 instances
const asgName = 'eks-karpenter_controller-eec9003f-c775-6697-5f4b-d2f580a620b4'; // Replace with your ASG name
scaleUp(asgName);
// step 2: create all nodepools 
    let stdout = "";
    let strerr = "";
    var util = require('util'),
        spawn = require('child_process').spawn,
        bash = spawn('kubectl', ['--kubeconfig', 'config',"apply","-f" ,'nodepools.yaml']); // [''] place holders for args 


    bash.stdout.on('data', function(data) { // stdout handler
        console.log('stdout: ' + data);
        stdout = stdout + data;
    });

    bash.stderr.on('data', function(data) { // stderr handler
        console.log('stderr: ' + data);
        // context.fail('stderr: ' + data);
        strerr = strerr + data;
        // context.fail('Something went wrong');
    });

    bash.on('exit', function(code) { // exit code handler
        console.log('kubectl exited with code ' + code);
        if (code != 0) {
            context.fail({ code: code, strerr: strerr, stdout: stdout });
        }
        else {
            context.succeed({ code: code, strerr: strerr, stdout: stdout });
        }

    });
    // // if (stdin) {
    // //     bash.stdin.write(stdin);
    // //     bash.stdin.end();
    // // }
    //  step 3 : send slack notification that cluster went up 
const webhook_url = process.env.SLACK_WEBHOOK;
const message_to_send = ':k8s: *Staging Scaled UP* :white_check_mark:'
sendSlackNotification(webhook_url, message_to_send);
};
// handler(null,null);
