/* 

contains 3 operations 
1. delete all nodepools (hence removing the nodes)
2. scale down karpenter controller nodegroup 
3. send slack notification that cluster scaled down 
 */
// Import the necessary AWS SDK client
const https = require('https');
const { URL } = require('url');
const { AutoScalingClient, DescribeAutoScalingGroupsCommand, UpdateAutoScalingGroupCommand } = require("@aws-sdk/client-auto-scaling");
// Import the necessary AWS SDK client
const { EC2Client, DescribeInstancesCommand } = require("@aws-sdk/client-ec2");

// Create an EC2 client
const ec2Client = new EC2Client({ region: 'eu-west-1' }); // Specify your region

// Function to list EC2 instances with a specific tag key
const listEC2InstancesByTag = async (tagKey) => {
    try {
        // Create the DescribeInstances command with a filter for the tag key
        const command = new DescribeInstancesCommand({
            Filters: [
                {
                    Name: `tag-key`,  // Filter by tag key
                    Values: [tagKey]
                }
            ]
        });
        
        // Send the command to the EC2 client
        const response = await ec2Client.send(command);
        
        // Iterate through the instances and log them
        const instances = response.Reservations.map(reservation => reservation.Instances).flat();
        if (instances.length === 0) {
            console.log(`No instances found with the tag key: ${tagKey}`);
        } else {
            // console.log(instances[0]);
            instances.forEach(instance => {
                console.log(`Instance ID: ${instance.InstanceId}`);
                console.log(`State: ${instance.State.Name}`);
                console.log(`State: ${instance.PrivateDnsName}`);
                console.log('-----------------------------');
            });
           var filtered_instances=instances.filter(instance=> instance.State.Name ='running' && instance.PrivateDnsName!='' );
           var node_names=filtered_instances.map(instance => instance.PrivateDnsName);
          return node_names;
        }
    } catch (error) {
        console.error('Error listing EC2 instances:', error);
    }
};


// Create an AutoScaling client
const autoscalingClient = new AutoScalingClient({ region: 'eu-west-1' }); // Specify your region

// Function to scale down an Auto Scaling Group (ASG) to zero
const scaleDownToZero = async (asgName) => {
    try {
        // Step 1: Update the ASG with desired capacity set to 0
        const updateCommand = new UpdateAutoScalingGroupCommand({
            AutoScalingGroupName: asgName,
            DesiredCapacity: 0,
            MinSize: 0,
            MaxSize: 0
        });
        await autoscalingClient.send(updateCommand);

        console.log(`Successfully scaled down ASG ${asgName} to Desired Capacity: 0`);
    } catch (error) {
        console.error('Error scaling down ASG:', error);
    }
};

function sendSlackNotification(webhook_url, message) {
    const payload = JSON.stringify({ text: message });
    const url = new URL(webhook_url);
//  construct these options from the webhook url
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
// step 1 :  delete all nodepools & nodeclaims
    let stdout = "";
    let strerr = "";
    let nodepools=['openroute','monitor-np','default','default-amd-2']
    var util = require('util'),
        spawn = require('child_process').spawn,
    // // nodepools.reduce(function (np_name){
    // //     var bash= spawn('kubectl', ['--kubeconfig', 'config','delete','nodepools.karpenter.sh',np_name]);
    // //     bash.stdout.on('data', function(data) { // stdout handler
    // //     console.log('stdout: ' + data);
    // //     stdout = stdout + data;
    // // });

    // // bash.stderr.on('data', function(data) { // stderr handler
    // //     console.log('stderr: ' + data);
    // //     // context.fail('stderr: ' + data);
    // //     strerr = strerr + data;
    // //     // context.fail('Something went wrong');
    // // });

    // // bash.on('exit', function(code) { // exit code handler
    // //     console.log('kubectl exited with code ' + code);
    // //     if (code != 0) {
    // //         context.fail({ code: code, strerr: strerr, stdout: stdout });
    // //     }
    // //     else {
    // //         context.succeed({ code: code, strerr: strerr, stdout: stdout });
    // //     }

    // // });
    // // },{})
        bash_np = spawn('kubectl', ['--kubeconfig', 'config','delete','--all','nodepools.karpenter.sh']), // [''] place holders for args 
        bash_nc = spawn('kubectl', ['--kubeconfig', 'config','delete','--all','nodeclaims']); // [''] place holders for args 
        

    bash_np.stdout.on('data', function(data) { // stdout handler
        console.log('stdout: ' + data);
        stdout = stdout + data;
    });

    bash_np.stderr.on('data', function(data) { // stderr handler
        console.log('stderr: ' + data);
        // context.fail('stderr: ' + data);
        strerr = strerr + data;
        // context.fail('Something went wrong');
    });

    bash_np.on('exit', function(code) { // exit code handler
        console.log('kubectl exited with code ' + code);
        if (code != 0) {
            context.fail({ code: code, strerr: strerr, stdout: stdout });
        }
        else {
            context.succeed({ code: code, strerr: strerr, stdout: stdout });
        }

    });
        bash_nc.stdout.on('data', function(data) { // stdout handler
        console.log('stdout: ' + data);
        stdout = stdout + data;
    });

    bash_nc.stderr.on('data', function(data) { // stderr handler
        console.log('stderr: ' + data);
        // context.fail('stderr: ' + data);
        strerr = strerr + data;
        // context.fail('Something went wrong');
    });

    bash_nc.on('exit', function(code) { // exit code handler
        console.log('kubectl exited with code ' + code);
        if (code != 0) {
            context.fail({ code: code, strerr: strerr, stdout: stdout });
        }
        else {
            context.succeed({ code: code, strerr: strerr, stdout: stdout });
        }

    });

        // if (stdin) {
    //     bash.stdin.write(stdin);
    //     bash.stdin.end();
    // }
//   setTimeout(function() {
    // }, 7000);
    //  step 2 : scale down ASG of karpenter controller 
    // Example usage: Scale down the ASG named 'my-auto-scaling-group' to 0 instances
const asgName = 'eks-karpenter_controller-eec9003f-c775-6697-5f4b-d2f580a620b4'; // Replace with your ASG name
// scaleDownToZero(asgName);
// Call the function to list instances with a specific tag key
const tagKey = 'karpenter.sh/nodepool'; // Replace with your tag key
// console.log(nodenames);
// nodenames.forEach(node =>
// {
//             var bash_patch= spawn('kubectl', ['--kubeconfig', 'config','patch','node', node, '-p', "'{\"metadata\":{\"finalizers\":null}}'", '--type=merge']);
//             var bash_delete= spawn('kubectl', ['--kubeconfig', 'config','delete','nodepools.karpenter.sh',np_name]);
//                 bash_patch.stdout.on('data', function(data) { // stdout handler
//         console.log('stdout: ' + data);
//         stdout = stdout + data;
//     });
//                 bash_patch.stderr.on('data', function(data) { // stderr handler
//                     console.log('stderr: ' + data);
//                     // context.fail('stderr: ' + data);
//                     strerr = strerr + data;
//                     // context.fail('Something went wrong');
//                 });
//                 bash_patch.on('exit', function(code) { // exit code handler
//                     console.log('kubectl exited with code ' + code);
//                     if (code != 0) {
//                         context.fail({ code: code, strerr: strerr, stdout: stdout });
//                     }
//                     else {
//                         context.succeed({ code: code, strerr: strerr, stdout: stdout });
//                     }
//                 });
//                 bash_delete.stdout.on('data', function(data) { // stdout handler
//                     console.log('stdout: ' + data);
//                     stdout = stdout + data;
//                 });
//                 bash_delete.stderr.on('data', function(data) { // stderr handler
//                     console.log('stderr: ' + data);
//                     // context.fail('stderr: ' + data);
//                     strerr = strerr + data;
//                     // context.fail('Something went wrong');
//                 });
//                 bash_delete.on('exit', function(code) { // exit code handler
//                     console.log('kubectl exited with code ' + code);
//                     if (code != 0) {
//                         context.fail({ code: code, strerr: strerr, stdout: stdout });
//                     }
//                     else {
//                         context.succeed({ code: code, strerr: strerr, stdout: stdout });
//                     }
//                 });
//                         });
//  step 3 : send slack notification that cluster went down 
const webhook_url = process.env.SLACK_WEBHOOK;
const message_to_send = ':k8s: *Staging Scaled Down* :red_circle:'
sendSlackNotification(webhook_url, message_to_send);
}
// handler(null,null);
