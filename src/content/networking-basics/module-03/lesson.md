---
title: IP Addresses and Internet Communication
objectives:
- Describe what an IP address is for.
- Explain what DNS does.
- Explain what a packet is.
- Describe the simplified steps for opening a website.
terms: ip address, dns, packet, server, https, gateway
---
## IP addresses
An **Internet Protocol (IP) address** identifies a network interface for communication. IPv4 addresses are often written as four decimal numbers separated by dots, such as 192.168.1.10.

Private addresses can be used inside a LAN. A public-facing address is used for communication across the wider internet, often with network address translation in home networks.

## DNS and names
The **Domain Name System (DNS)** helps a device find an IP address associated with a domain name, such as example.com.

DNS does not itself load a web page. It supplies information used to reach the destination. A name lookup problem can stop a website opening by name even when the network is connected.

## Packets and website requests
Large messages are split into manageable units called **packets**. The network directs packets toward the destination.

In a simplified webpage visit:
- Enter the domain name.
- Resolve the name using DNS.
- Connect to the server.
- Request and receive the page content.

Modern browsing may also use encrypted **HTTPS** connections.

## Visual steps
- Learner types example.com | The browser starts with a name that people can remember.
- DNS resolves the name | DNS supplies the IP address for that name.
- Packets route to the web server | Data travels in packets toward the server.
- Webpage appears | The page content comes back and your browser shows it.
- Simplified model | Real connections have more steps, but this order is a good start.

## Example
You type a school website name. DNS finds its IP address. Your browser connects to the server, requests the page, and receives it in packets. The page then appears on your screen.

## Practice
Explain why opening a site by a known IP address might work when its domain name fails, and why that result alone does not guarantee every site supports direct-IP browsing.
